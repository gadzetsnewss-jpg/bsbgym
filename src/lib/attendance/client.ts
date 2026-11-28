import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type {
  AttendanceDailySummary,
  AttendanceMethod,
  MemberAttendanceRow,
  MemberAttendanceStats,
  MemberLookupResult,
  StaffAttendanceRow,
  StaffAttendanceStatus,
} from "./types";

type AnyTable = any;

function friendlyMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const msg = String((error as { message: unknown }).message);
    return msg;
  }
  return "An unexpected error occurred.";
}

/**
 * Searches members by code, name, phone, or QR string and computes active membership & attendance eligibility.
 */
export async function lookupMemberForAttendance(
  organizationId: string,
  query: string,
  branchId?: string,
): Promise<{ data: MemberLookupResult | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const cleanQuery = query.trim();
    if (!cleanQuery) return { data: null, error: null };

    // 1. Find member by code, phone, or full_name
    let queryBuilder = (supabase as any)
      .from("gym_members")
      .select("id, code, full_name, first_name, last_name, phone, email, status, branch_id, branches(id, name)")
      .eq("organization_id", organizationId);

    // If query looks like a UUID (e.g. from QR)
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(cleanQuery)) {
      queryBuilder = queryBuilder.eq("id", cleanQuery);
    } else {
      queryBuilder = queryBuilder.or(
        `code.ilike.%${cleanQuery}%,phone.ilike.%${cleanQuery}%,full_name.ilike.%${cleanQuery}%`,
      );
    }

    const { data: members, error: memberErr } = await queryBuilder.limit(1);
    if (memberErr) return { data: null, error: { message: friendlyMessage(memberErr) } };
    if (!members || members.length === 0) return { data: null, error: null };

    const member = members[0] as any;
    const branchName = member.branches?.name ?? "Main Branch";

    // 2. Check for open check-in
    const { data: openCheckIn, error: checkInErr } = await (supabase as any)
      .from("attendance_records")
      .select("id, check_in_at, method, branch_id, branches(id, name)")
      .eq("organization_id", organizationId)
      .eq("member_id", member.id)
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false })
      .limit(1);

    if (checkInErr) return { data: null, error: { message: friendlyMessage(checkInErr) } };

    const activeRecord = openCheckIn && openCheckIn.length > 0 ? (openCheckIn[0] as any) : null;

    // 3. Find latest membership
    const { data: memberships, error: memErr } = await (supabase as any)
      .from("memberships")
      .select("id, status, start_date, end_date, membership_plans(id, name), membership_freezes(id, start_date, end_date)")
      .eq("organization_id", organizationId)
      .eq("member_id", member.id)
      .order("end_date", { ascending: false })
      .limit(5);

    if (memErr) return { data: null, error: { message: friendlyMessage(memErr) } };

    const today = new Date().toISOString().split("T")[0];
    let selectedMembership: any = null;
    let isFrozen = false;
    let freezeEndDate: string | null = null;

    if (memberships && memberships.length > 0) {
      // Find an active membership covering today first
      selectedMembership =
        memberships.find(
          (m: any) => m.status === "active" && m.start_date <= today && m.end_date >= today,
        ) || memberships[0];

      if (selectedMembership && selectedMembership.membership_freezes) {
        const freezes = Array.isArray(selectedMembership.membership_freezes)
          ? selectedMembership.membership_freezes
          : [selectedMembership.membership_freezes];
        const activeFreeze = freezes.find(
          (f: any) => f && f.start_date <= today && f.end_date >= today,
        );
        if (activeFreeze) {
          isFrozen = true;
          freezeEndDate = activeFreeze.end_date;
        }
      }
    }

    // Determine eligibility and denial reason
    let canCheckIn = true;
    let denialReason: string | null = null;

    if (member.status === "suspended") {
      canCheckIn = false;
      denialReason = "Member account is suspended.";
    } else if (member.status === "inactive") {
      canCheckIn = false;
      denialReason = "Member account is inactive.";
    } else if (activeRecord) {
      canCheckIn = false;
      denialReason = "Member already has an open check-in in progress.";
    } else if (!selectedMembership) {
      canCheckIn = false;
      denialReason = "No membership found for member.";
    } else if (selectedMembership.status === "pending") {
      canCheckIn = false;
      denialReason = "Membership is pending activation or payment.";
    } else if (selectedMembership.status === "cancelled") {
      canCheckIn = false;
      denialReason = "Membership has been cancelled.";
    } else if (selectedMembership.status === "expired" || selectedMembership.end_date < today) {
      canCheckIn = false;
      denialReason = `Membership expired on ${selectedMembership.end_date}.`;
    } else if (selectedMembership.start_date > today) {
      canCheckIn = false;
      denialReason = `Membership starts on ${selectedMembership.start_date}.`;
    } else if (isFrozen) {
      canCheckIn = false;
      denialReason = `Membership is currently frozen until ${freezeEndDate}.`;
    }

    return {
      data: {
        member: {
          id: member.id,
          code: member.code,
          fullName: member.full_name,
          firstName: member.first_name,
          lastName: member.last_name,
          phone: member.phone,
          email: member.email,
          status: member.status,
          branchId: member.branch_id,
          branchName,
        },
        membership: selectedMembership
          ? {
              id: selectedMembership.id,
              planName: selectedMembership.membership_plans?.name ?? "Standard Plan",
              status: selectedMembership.status,
              startDate: selectedMembership.start_date,
              endDate: selectedMembership.end_date,
              isFrozen,
              freezeEndDate,
            }
          : null,
        activeCheckIn: activeRecord
          ? {
              recordId: activeRecord.id,
              checkInAt: activeRecord.check_in_at,
              branchName: activeRecord.branches?.name ?? "Unknown branch",
              method: activeRecord.method,
            }
          : null,
        canCheckIn,
        denialReason,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Checks in a member using the hardened create_attendance_record RPC.
 */
export async function checkInMember(input: {
  organizationId: string;
  branchId: string;
  memberId: string;
  method?: AttendanceMethod;
  notes?: string;
  checkInAt?: string;
}): Promise<{ data: string | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data, error } = await (supabase as any).rpc("create_attendance_record", {
      p_org_id: input.organizationId,
      p_branch_id: input.branchId,
      p_member_id: input.memberId,
      p_method: input.method ?? "manual",
      p_notes: input.notes ?? null,
      p_check_in_at: input.checkInAt ?? null,
    });

    if (error) return { data: null, error: { message: friendlyMessage(error) } };
    return { data: data as string, error: null };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Checks out a member using check_out_member_attendance RPC.
 */
export async function checkOutMember(input: {
  organizationId: string;
  recordId: string;
  notes?: string;
  checkOutAt?: string;
}): Promise<{ success: boolean; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { success: false, error: { message: "Supabase client not initialized." } };

    const { error } = await (supabase as any).rpc("check_out_member_attendance", {
      p_org_id: input.organizationId,
      p_record_id: input.recordId,
      p_check_out_at: input.checkOutAt ?? null,
      p_notes: input.notes ?? null,
    });

    if (error) return { success: false, error: { message: friendlyMessage(error) } };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Loads currently active (in-gym now) members.
 */
export async function loadActiveGymMembers(
  organizationId: string,
  branchId?: string,
): Promise<{ data: MemberAttendanceRow[] | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    let query = (supabase as any)
      .from("attendance_records")
      .select(
        "id, organization_id, branch_id, member_id, check_in_at, check_out_at, method, notes, branches(id, name), gym_members(id, code, full_name, phone)",
      )
      .eq("organization_id", organizationId)
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false });

    if (branchId) {
      query = query.eq("branch_id", branchId);
    }

    const { data, error } = await query;
    if (error) return { data: null, error: { message: friendlyMessage(error) } };

    const rows: MemberAttendanceRow[] = (data ?? []).map((r: any) => {
      const inTime = new Date(r.check_in_at).getTime();
      const now = Date.now();
      const durationMinutes = Math.max(0, Math.floor((now - inTime) / 60000));

      return {
        id: r.id,
        organizationId: r.organization_id,
        branchId: r.branch_id,
        branchName: r.branches?.name ?? "Main Branch",
        memberId: r.member_id,
        memberCode: r.gym_members?.code ?? null,
        memberName: r.gym_members?.full_name ?? "Member",
        memberPhone: r.gym_members?.phone ?? null,
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        method: r.method,
        notes: r.notes,
        durationMinutes,
      };
    });

    return { data: rows, error: null };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Loads member attendance history with filters.
 */
export async function loadMemberAttendanceHistory(
  organizationId: string,
  options: {
    branchId?: string;
    method?: string;
    search?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ data: MemberAttendanceRow[] | null; total: number; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, total: 0, error: { message: "Supabase client not initialized." } };

    let query = (supabase as any)
      .from("attendance_records")
      .select(
        "id, organization_id, branch_id, member_id, check_in_at, check_out_at, method, notes, branches(id, name), gym_members(id, code, full_name, phone)",
        { count: "exact" },
      )
      .eq("organization_id", organizationId);

    if (options.branchId) {
      query = query.eq("branch_id", options.branchId);
    }
    if (options.method && options.method !== "all") {
      query = query.eq("method", options.method);
    }
    if (options.startDate) {
      query = query.gte("check_in_at", `${options.startDate}T00:00:00Z`);
    }
    if (options.endDate) {
      query = query.lte("check_in_at", `${options.endDate}T23:59:59Z`);
    }

    query = query.order("check_in_at", { ascending: false });

    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return { data: null, total: 0, error: { message: friendlyMessage(error) } };

    const rows: MemberAttendanceRow[] = (data ?? []).map((r: any) => {
      let durationMinutes: number | null = null;
      if (r.check_in_at) {
        const inMs = new Date(r.check_in_at).getTime();
        const outMs = r.check_out_at ? new Date(r.check_out_at).getTime() : Date.now();
        durationMinutes = Math.max(0, Math.floor((outMs - inMs) / 60000));
      }

      return {
        id: r.id,
        organizationId: r.organization_id,
        branchId: r.branch_id,
        branchName: r.branches?.name ?? "Main Branch",
        memberId: r.member_id,
        memberCode: r.gym_members?.code ?? null,
        memberName: r.gym_members?.full_name ?? "Member",
        memberPhone: r.gym_members?.phone ?? null,
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        method: r.method,
        notes: r.notes,
        durationMinutes,
      };
    });

    return { data: rows, total: count ?? rows.length, error: null };
  } catch (err) {
    return { data: null, total: 0, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Loads daily attendance summary KPIs using real database aggregates.
 */
export async function loadDailyAttendanceSummary(
  organizationId: string,
  branchId?: string,
  date?: string,
): Promise<{ data: AttendanceDailySummary | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data, error } = await (supabase as any).rpc("get_daily_attendance_summary", {
      p_org_id: organizationId,
      p_branch_id: branchId ?? null,
      p_date: date ?? null,
    });

    if (error) return { data: null, error: { message: friendlyMessage(error) } };

    const raw = data as any;
    return {
      data: {
        date: raw.date,
        membersToday: Number(raw.members_today ?? 0),
        membersCurrentlyInGym: Number(raw.members_currently_in_gym ?? 0),
        staffToday: Number(raw.staff_today ?? 0),
        staffOnDuty: Number(raw.staff_on_duty ?? 0),
        staffTotalHours: Number(raw.staff_total_hours ?? 0),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Staff self-service clock-in.
 */
export async function staffClockIn(input: {
  organizationId: string;
  branchId: string;
  method?: AttendanceMethod;
  notes?: string;
  deviceMetadata?: Record<string, unknown>;
}): Promise<{ data: string | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data, error } = await (supabase as any).rpc("staff_clock_in", {
      p_org_id: input.organizationId,
      p_branch_id: input.branchId,
      p_method: input.method ?? "web",
      p_notes: input.notes ?? null,
      p_device_metadata: input.deviceMetadata ?? {},
    });

    if (error) return { data: null, error: { message: friendlyMessage(error) } };
    return { data: data as string, error: null };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Staff self-service clock-out.
 */
export async function staffClockOut(input: {
  organizationId: string;
  recordId?: string;
  notes?: string;
  deviceMetadata?: Record<string, unknown>;
}): Promise<{ success: boolean; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { success: false, error: { message: "Supabase client not initialized." } };

    const { error } = await (supabase as any).rpc("staff_clock_out", {
      p_org_id: input.organizationId,
      p_record_id: input.recordId ?? null,
      p_notes: input.notes ?? null,
      p_device_metadata: input.deviceMetadata ?? {},
    });

    if (error) return { success: false, error: { message: friendlyMessage(error) } };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Checks if the current authenticated staff member has an open shift.
 */
export async function loadCurrentStaffShift(
  organizationId: string,
): Promise<{ data: StaffAttendanceRow | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data: authData } = await supabase.auth.getUser();
    if (!authData?.user?.id) return { data: null, error: null };

    const { data, error } = await (supabase as any)
      .from("staff_attendance_records")
      .select("id, organization_id, branch_id, user_id, check_in_at, check_out_at, status, method, working_hours, notes, branches(id, name)")
      .eq("organization_id", organizationId)
      .eq("user_id", authData.user.id)
      .is("check_out_at", null)
      .order("check_in_at", { ascending: false })
      .limit(1);

    if (error) return { data: null, error: { message: friendlyMessage(error) } };
    if (!data || data.length === 0) return { data: null, error: null };

    const r = data[0] as any;
    return {
      data: {
        id: r.id,
        organizationId: r.organization_id,
        branchId: r.branch_id,
        branchName: r.branches?.name ?? "Main Branch",
        userId: r.user_id,
        staffName: "Me",
        roleName: "Staff",
        roleSlug: "staff",
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        status: r.status,
        method: r.method,
        workingHours: r.working_hours,
        notes: r.notes,
        correctionReason: null,
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Loads staff attendance history.
 */
export async function loadStaffAttendanceHistory(
  organizationId: string,
  options: {
    branchId?: string;
    roleSlug?: string;
    status?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  } = {},
): Promise<{ data: StaffAttendanceRow[] | null; total: number; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, total: 0, error: { message: "Supabase client not initialized." } };

    let query = (supabase as any)
      .from("staff_attendance_records")
      .select(
        `id, organization_id, branch_id, user_id, trainer_id, check_in_at, check_out_at, status, method, working_hours, notes, correction_reason, corrected_at,
        branches(id, name),
        trainers(id, full_name)`
      )
      .eq("organization_id", organizationId);

    if (options.branchId) {
      query = query.eq("branch_id", options.branchId);
    }
    if (options.status && options.status !== "all") {
      query = query.eq("status", options.status);
    }
    if (options.startDate) {
      query = query.gte("check_in_at", `${options.startDate}T00:00:00Z`);
    }
    if (options.endDate) {
      query = query.lte("check_in_at", `${options.endDate}T23:59:59Z`);
    }

    query = query.order("check_in_at", { ascending: false });
    const limit = options.limit ?? 50;
    const offset = options.offset ?? 0;
    query = query.range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) return { data: null, total: 0, error: { message: friendlyMessage(error) } };

    // Fetch user profiles & roles for user_ids
    const userIds = Array.from(new Set((data ?? []).map((r: any) => r.user_id)));
    const profilesMap = new Map<string, { name: string; role: string; roleSlug: string }>();

    if (userIds.length > 0) {
      const { data: members } = await (supabase as any)
        .from("organization_members")
        .select("user_id, roles(id, name, slug)")
        .eq("organization_id", organizationId)
        .in("user_id", userIds);

      const { data: profiles } = await (supabase as any)
        .from("profiles")
        .select("id, full_name, first_name, last_name")
        .in("id", userIds);

      const rolesByUserId = new Map<string, { name: string; slug: string }>();
      (members ?? []).forEach((m: any) => {
        rolesByUserId.set(m.user_id, {
          name: m.roles?.name ?? "Staff",
          slug: m.roles?.slug ?? "staff",
        });
      });

      (profiles ?? []).forEach((p: any) => {
        const roleInfo = rolesByUserId.get(p.id) ?? { name: "Staff", slug: "staff" };
        profilesMap.set(p.id, {
          name: p.full_name || `${p.first_name || ""} ${p.last_name || ""}`.trim() || "Staff Member",
          role: roleInfo.name,
          roleSlug: roleInfo.slug,
        });
      });
    }

    const rows: StaffAttendanceRow[] = (data ?? []).map((r: any) => {
      const profile = profilesMap.get(r.user_id);
      const staffName = r.trainers?.full_name || profile?.name || "Staff Member";
      const roleName = profile?.role ?? "Staff";
      const roleSlug = profile?.roleSlug ?? "staff";

      return {
        id: r.id,
        organizationId: r.organization_id,
        branchId: r.branch_id,
        branchName: r.branches?.name ?? "Main Branch",
        userId: r.user_id,
        staffName,
        roleName,
        roleSlug,
        trainerId: r.trainer_id,
        checkInAt: r.check_in_at,
        checkOutAt: r.check_out_at,
        status: r.status,
        method: r.method,
        workingHours: r.working_hours,
        notes: r.notes,
        correctionReason: r.correction_reason,
        correctedAt: r.corrected_at,
      };
    });

    return { data: rows, total: count ?? rows.length, error: null };
  } catch (err) {
    return { data: null, total: 0, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Corrects staff attendance with mandatory reason.
 */
export async function correctStaffAttendance(input: {
  organizationId: string;
  recordId: string;
  checkInAt: string;
  checkOutAt?: string | null;
  status: StaffAttendanceStatus;
  reason: string;
  notes?: string;
}): Promise<{ success: boolean; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { success: false, error: { message: "Supabase client not initialized." } };

    const { error } = await (supabase as any).rpc("correct_staff_attendance", {
      p_org_id: input.organizationId,
      p_record_id: input.recordId,
      p_check_in_at: input.checkInAt,
      p_check_out_at: input.checkOutAt ?? null,
      p_status: input.status,
      p_reason: input.reason,
      p_notes: input.notes ?? null,
    });

    if (error) return { success: false, error: { message: friendlyMessage(error) } };
    return { success: true, error: null };
  } catch (err) {
    return { success: false, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Admin manual entry of staff attendance.
 */
export async function adminRecordStaffAttendance(input: {
  organizationId: string;
  branchId: string;
  userId: string;
  checkInAt: string;
  checkOutAt?: string | null;
  status?: StaffAttendanceStatus;
  reason?: string;
  notes?: string;
}): Promise<{ data: string | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data, error } = await (supabase as any).rpc("admin_record_staff_attendance", {
      p_org_id: input.organizationId,
      p_branch_id: input.branchId,
      p_user_id: input.userId,
      p_check_in_at: input.checkInAt,
      p_check_out_at: input.checkOutAt ?? null,
      p_status: input.status ?? "present",
      p_reason: input.reason ?? null,
      p_notes: input.notes ?? null,
    });

    if (error) return { data: null, error: { message: friendlyMessage(error) } };
    return { data: data as string, error: null };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}

/**
 * Loads attendance stats for member portal.
 */
export async function loadMemberMyAttendanceStats(
  organizationId: string,
  memberId?: string,
): Promise<{ data: MemberAttendanceStats | null; error: { message: string } | null }> {
  try {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

    const { data, error } = await (supabase as any).rpc("get_member_attendance_stats", {
      p_org_id: organizationId,
      p_member_id: memberId ?? null,
    });

    if (error) return { data: null, error: { message: friendlyMessage(error) } };

    const raw = data as any;
    return {
      data: {
        totalVisits: Number(raw.total_visits ?? 0),
        monthVisits: Number(raw.month_visits ?? 0),
        monthDaysPresent: Number(raw.month_days_present ?? 0),
        currentStreak: Number(raw.current_streak ?? 0),
        attendancePercentage: Number(raw.attendance_percentage ?? 0),
        daysInMonth: Number(raw.days_in_month ?? 30),
      },
      error: null,
    };
  } catch (err) {
    return { data: null, error: { message: friendlyMessage(err) } };
  }
}
