/**
 * Static migration invariant tests for Phase 4 attendance, class session,
 * and booking capacity RPCs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260929000022_phase_4_trainers_attendance_classes.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("Phase 4 operations RPC migration", () => {
  it("keeps create_attendance_record signature and permission", () => {
    const body = functionBody("create_attendance_record");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
    expect(body).toMatch(/require_org_permission\(p_org_id, 'attendance\.create'\)/);
    expect(body).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(migration).toMatch(
      /grant execute on function public\.create_attendance_record\([\s\S]*?to authenticated/,
    );
  });

  it("rejects check-in without an active membership covering the date", () => {
    const body = functionBody("create_attendance_record");
    expect(body).toMatch(/member does not have an active membership/);
    expect(body).toMatch(/m\.status = 'active'/);
    expect(body).toMatch(/m\.start_date <= v_check_date/);
    expect(body).toMatch(/m\.end_date >= v_check_date/);
  });

  it("rejects check-in during a freeze window and does not use frozen member status", () => {
    const body = functionBody("create_attendance_record");
    expect(body).toMatch(/check-in is not allowed during a membership freeze/);
    expect(body).toMatch(/membership_freezes/);
    expect(body).not.toMatch(/'frozen'/);
  });

  it("rejects a second open check-in", () => {
    const body = functionBody("create_attendance_record");
    expect(body).toMatch(/member already has an open check-in/);
    expect(body).toMatch(/r\.check_out_at is null/);
  });

  it("defines class session write RPCs as SECURITY DEFINER", () => {
    for (const fn of ["create_class_session", "update_class_session", "set_class_session_status"]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
    expect(functionBody("create_class_session")).toMatch(
      /require_org_permission\(p_org_id, 'classes\.manage'\)/,
    );
    expect(functionBody("create_class_session")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(functionBody("update_class_session")).not.toMatch(/p_org_id/);
    expect(functionBody("update_class_session")).toMatch(
      /require_org_permission\(v_org_id, 'classes\.manage'\)/,
    );
    expect(functionBody("set_class_session_status")).toMatch(/'scheduled', 'completed', 'cancelled'/);
  });

  it("auto-waitlists bookings when the session is at capacity", () => {
    const body = functionBody("create_class_booking");
    expect(body).toMatch(/v_status := 'waitlisted'/);
    expect(body).toMatch(/b\.status in \('booked', 'attended'\)/);
    expect(body).toMatch(/member is already booked for this class/);
    expect(body).toMatch(/member does not have an active membership/);
    expect(body).toMatch(/booking is not allowed during a membership freeze/);
    expect(body).toMatch(/class session is cancelled/);
    expect(body).not.toMatch(/'frozen'/);
  });

  it("promotes the oldest waitlisted booking when a seat is freed", () => {
    const body = functionBody("update_class_booking");
    expect(body).toMatch(/v_old_status in \('booked', 'attended'\)/);
    expect(body).toMatch(/b\.status = 'waitlisted'/);
    expect(body).toMatch(/order by b\.created_at/);
    expect(body).toMatch(/set status = 'booked'/);
  });

  it("never hard-deletes operations rows", () => {
    expect(migration).not.toMatch(
      /delete from public\.(attendance_records|class_sessions|class_bookings|memberships|membership_freezes)/i,
    );
    expect(migration).not.toMatch(/drop table/i);
  });
});
