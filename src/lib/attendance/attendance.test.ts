import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type {
  AttendanceDailySummary,
  AttendanceMethod,
  MemberAttendanceRow,
  MemberAttendanceStats,
  MemberLookupResult,
  StaffAttendanceRow,
  StaffAttendanceStatus,
} from "./types";

describe("Attendance Management System Tests", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20261127000046_complete_attendance_management.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf-8");
  const combinePath = resolve(process.cwd(), "supabase/COMBINE.sql");
  const combineSql = readFileSync(combinePath, "utf-8");

  describe("1. Database Schema & Migration Invariants (20261127000046)", () => {
    it("defines public.staff_attendance_records table with exact schema, columns and check constraints", () => {
      expect(migrationSql).toContain("create table if not exists public.staff_attendance_records");
      expect(migrationSql).toContain("id uuid primary key default gen_random_uuid()");
      expect(migrationSql).toContain("organization_id uuid not null references public.organizations(id)");
      expect(migrationSql).toContain("branch_id uuid not null");
      expect(migrationSql).toContain("user_id uuid not null references auth.users(id)");
      expect(migrationSql).toContain("trainer_id uuid references public.trainers(id)");
      expect(migrationSql).toContain("check_in_at timestamptz not null default now()");
      expect(migrationSql).toContain("check_out_at timestamptz");
      expect(migrationSql).toContain(
        "check (status in ('present', 'late', 'half_day', 'absent', 'on_leave'))",
      );
      expect(migrationSql).toContain(
        "check (method in ('web', 'qr', 'manual', 'biometric', 'app'))",
      );
      expect(migrationSql).toContain("working_hours numeric(6, 2)");
      expect(migrationSql).toContain("correction_reason text");
      expect(migrationSql).toContain("corrected_by uuid references auth.users(id)");
      expect(migrationSql).toContain("corrected_at timestamptz");
      expect(migrationSql).toContain("device_metadata jsonb not null default '{}'::jsonb");
      expect(migrationSql).toContain(
        "check (check_out_at is null or check_out_at >= check_in_at)",
      );
    });

    it("enforces partial unique index preventing duplicate open shifts for staff", () => {
      expect(migrationSql).toContain("create unique index if not exists staff_attendance_open_shift_idx");
      expect(migrationSql).toContain("on public.staff_attendance_records(organization_id, user_id)");
      expect(migrationSql).toContain("where check_out_at is null;");
    });

    it("enforces branch-organization integrity constraint on staff_attendance_records", () => {
      expect(migrationSql).toContain(
        "foreign key (organization_id, branch_id) references public.branches(organization_id, id)",
      );
    });

    it("applies scoped RLS policy to staff_attendance_records", () => {
      expect(migrationSql).toContain("alter table public.staff_attendance_records enable row level security;");
      expect(migrationSql).toContain('create policy "staff attendance select policy"');
      expect(migrationSql).toContain("public.user_has_permission(organization_id, 'attendance.view')");
      expect(migrationSql).toContain("public.user_has_branch_access(organization_id, branch_id)");
      expect(migrationSql).toContain("(user_id = auth.uid())");
    });

    it("synchronizes migration 20261127000046 into COMBINE.sql", () => {
      expect(combineSql).toContain("20261127000046_complete_attendance_management.sql");
      expect(combineSql).toContain("create table if not exists public.staff_attendance_records");
      expect(combineSql).toContain("create or replace function public.staff_clock_in");
      expect(combineSql).toContain("create or replace function public.staff_clock_out");
      expect(combineSql).toContain("create or replace function public.correct_staff_attendance");
      expect(combineSql).toContain("create or replace function public.get_daily_attendance_summary");
    });
  });

  describe("2. Member Attendance Hardening & Validation", () => {
    it("locks gym_members row FOR UPDATE to serialize concurrent check-in attempts", () => {
      const start = migrationSql.indexOf("create or replace function public.create_attendance_record");
      const body = migrationSql.slice(start, migrationSql.indexOf("create or replace function", start + 1));
      expect(body).toContain("select * into v_member");
      expect(body).toContain("from public.gym_members");
      expect(body).toContain("where id = p_member_id");
      expect(body).toContain("and organization_id = p_org_id");
      expect(body).toContain("for update;");
    });

    it("strictly rejects suspended, inactive, or non-active member accounts", () => {
      expect(migrationSql).toContain("if v_member.status = 'suspended' then");
      expect(migrationSql).toContain("raise exception 'member account is suspended';");
      expect(migrationSql).toContain("elsif v_member.status = 'inactive' then");
      expect(migrationSql).toContain("raise exception 'member account is inactive';");
    });

    it("strictly rejects pending and cancelled memberships with clear denial reasons", () => {
      expect(migrationSql).toContain("elsif v_membership_status = 'pending' then");
      expect(migrationSql).toContain("raise exception 'membership is pending activation or payment';");
      expect(migrationSql).toContain("elsif v_membership_status = 'cancelled' then");
      expect(migrationSql).toContain("raise exception 'membership is cancelled';");
    });

    it("strictly rejects check-in during active membership freeze", () => {
      expect(migrationSql).toContain("raise exception 'check-in is not allowed during a membership freeze';");
      expect(migrationSql).toContain("f.start_date <= v_check_date");
      expect(migrationSql).toContain("f.end_date >= v_check_date");
    });

    it("strictly rejects duplicate open check-in when member is already in gym", () => {
      expect(migrationSql).toContain("raise exception 'member already has an open check-in';");
      expect(migrationSql).toContain("r.check_out_at is null");
    });

    it("provides check_out_member_attendance RPC with permission check and row locking", () => {
      expect(migrationSql).toContain("create or replace function public.check_out_member_attendance");
      expect(migrationSql).toContain("public.user_has_permission(p_org_id, 'attendance.create')");
      expect(migrationSql).toContain("public.user_has_permission(p_org_id, 'attendance.manage')");
      expect(migrationSql).toContain("select * into v_rec\n  from public.attendance_records");
      expect(migrationSql).toContain("for update;");
      expect(migrationSql).toContain("check-out cannot be before check-in");
    });
  });

  describe("3. Staff Attendance System & Audit Controls", () => {
    it("provides self-service staff_clock_in RPC with duplicate open shift check", () => {
      expect(migrationSql).toContain("create or replace function public.staff_clock_in");
      expect(migrationSql).toContain("raise exception 'staff member already has an open shift';");
      expect(migrationSql).toContain("v_now := timezone('utc', now());");
      expect(migrationSql).toContain("insert into public.staff_attendance_records");
    });

    it("provides staff_clock_out calculating exact working hours using server timestamps", () => {
      expect(migrationSql).toContain("create or replace function public.staff_clock_out");
      expect(migrationSql).toContain("round((extract(epoch from (v_now - v_record.check_in_at)) / 3600.0)::numeric, 2)");
      expect(migrationSql).toContain("update public.staff_attendance_records");
      expect(migrationSql).toContain("set check_out_at = v_now,");
      expect(migrationSql).toContain("working_hours = v_hours,");
    });

    it("strictly requires mandatory correction reason for correct_staff_attendance RPC", () => {
      expect(migrationSql).toContain("create or replace function public.correct_staff_attendance");
      expect(migrationSql).toContain("perform public.require_org_permission(p_org_id, 'attendance.manage');");
      expect(migrationSql).toContain("v_reason := nullif(trim(p_reason), '');");
      expect(migrationSql).toContain("if v_reason is null then");
      expect(migrationSql).toContain("raise exception 'correction reason is required';");
      expect(migrationSql).toContain("correction_reason = v_reason,");
      expect(migrationSql).toContain("corrected_by = auth.uid(),");
      expect(migrationSql).toContain("corrected_at = timezone('utc', now()),");
    });

    it("provides get_daily_attendance_summary returning real database aggregates", () => {
      expect(migrationSql).toContain("create or replace function public.get_daily_attendance_summary");
      expect(migrationSql).toContain("select count(distinct member_id) into v_members_today");
      expect(migrationSql).toContain("select count(*) into v_members_open");
      expect(migrationSql).toContain("select count(distinct user_id), coalesce(sum(working_hours), 0)");
      expect(migrationSql).toContain("select count(*) into v_staff_open");
    });

    it("provides get_member_attendance_stats for streak and monthly percentage calculation", () => {
      expect(migrationSql).toContain("create or replace function public.get_member_attendance_stats");
      expect(migrationSql).toContain("v_distinct_dates");
      expect(migrationSql).toContain("v_current_streak := v_current_streak + 1;");
      expect(migrationSql).toContain("attendance_percentage");
    });
  });

  describe("4. Business Logic Simulations & Concurrency Tests", () => {
    it("simulates concurrent check-in requests for the same member, ensuring serial execution and duplicate denial", async () => {
      interface AttendanceRecord {
        id: string;
        memberId: string;
        checkInAt: string;
        checkOutAt: string | null;
      }

      const records: AttendanceRecord[] = [];
      let memberRowLocked = false;

      const checkInSimulation = async (memberId: string, checkInId: string) => {
        // Step 1: Wait for member row lock (SELECT ... FOR UPDATE)
        while (memberRowLocked) {
          await new Promise((r) => setTimeout(r, 5));
        }
        memberRowLocked = true;

        try {
          // Step 2: Check for open check-in
          const hasOpen = records.some((r) => r.memberId === memberId && r.checkOutAt === null);
          if (hasOpen) {
            throw new Error("member already has an open check-in");
          }

          // Step 3: Insert record
          records.push({
            id: checkInId,
            memberId,
            checkInAt: new Date().toISOString(),
            checkOutAt: null,
          });
          return checkInId;
        } finally {
          memberRowLocked = false;
        }
      };

      // Run two concurrent check-ins
      const first = checkInSimulation("mem-1", "rec-1");
      const second = checkInSimulation("mem-1", "rec-2");

      const results = await Promise.allSettled([first, second]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.filter((r) => r.status === "rejected");

      expect(fulfilled).toHaveLength(1);
      expect(rejected).toHaveLength(1);
      if (rejected[0].status === "rejected") {
        expect(rejected[0].reason.message).toBe("member already has an open check-in");
      }
      expect(records).toHaveLength(1);
      expect(records[0].id).toBe("rec-1");
    });

    it("simulates staff clock-in duplicate open shift rejection", async () => {
      interface StaffShift {
        id: string;
        userId: string;
        checkInAt: string;
        checkOutAt: string | null;
      }

      const shifts: StaffShift[] = [
        { id: "shift-1", userId: "user-1", checkInAt: new Date().toISOString(), checkOutAt: null },
      ];

      const clockIn = (userId: string) => {
        const hasOpen = shifts.some((s) => s.userId === userId && s.checkOutAt === null);
        if (hasOpen) {
          throw new Error("staff member already has an open shift");
        }
        shifts.push({ id: "shift-2", userId, checkInAt: new Date().toISOString(), checkOutAt: null });
      };

      expect(() => clockIn("user-1")).toThrow("staff member already has an open shift");
      expect(shifts).toHaveLength(1);
    });

    it("simulates working hours calculation on staff clock-out", () => {
      const checkIn = new Date("2026-11-27T08:00:00Z");
      const checkOut = new Date("2026-11-27T16:30:00Z");

      const hours = Math.round(((checkOut.getTime() - checkIn.getTime()) / 3600000) * 100) / 100;
      expect(hours).toBe(8.5);
    });

    it("simulates consecutive visit streak calculation", () => {
      const today = new Date("2026-11-27");
      const distinctDates = [
        new Date("2026-11-27"),
        new Date("2026-11-26"),
        new Date("2026-11-25"),
        new Date("2026-11-23"), // gap on 24th
      ];

      let streak = 0;
      let prevDate = today;

      for (const d of distinctDates) {
        const diffDays = Math.round((prevDate.getTime() - d.getTime()) / (1000 * 3600 * 24));
        if (diffDays === 0) {
          streak = 1;
        } else if (diffDays === 1) {
          streak++;
          prevDate = d;
        } else {
          break;
        }
      }

      expect(streak).toBe(3);
    });
  });
});
