/**
 * Static migration invariant tests for Phase 3.2b operations write RPCs.
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: SECURITY DEFINER write RPCs, permission/membership/branch
 * re-checks, helper revoke, and the absence of hard deletes / frozen status.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260916000013_phase_3_2b_operations_rpcs.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const CREATE_FNS = [
  ["create_membership", "memberships.create"],
  ["create_membership_freeze", "memberships.freeze"],
  ["create_attendance_record", "attendance.create"],
  ["create_trainer_assignment", "trainers.assign"],
  ["create_pt_session", "trainers.assign"],
  ["create_class_booking", "bookings.manage"],
  ["create_workout_plan", "fitness.manage"],
  ["create_diet_plan", "fitness.manage"],
  ["create_body_measurement", "fitness.manage"],
  ["create_progress_entry", "fitness.manage"],
] as const;

const UPDATE_FNS = [
  ["update_membership", "memberships.update"],
  ["update_attendance_record", "attendance.manage"],
  ["update_pt_session", "trainers.edit"],
  ["update_class_booking", "bookings.manage"],
  ["update_workout_plan", "fitness.manage"],
  ["update_diet_plan", "fitness.manage"],
  ["update_body_measurement", "fitness.manage"],
  ["update_progress_entry", "fitness.manage"],
] as const;

describe("Phase 3.2b operations RPC migration - helpers", () => {
  it("keeps require_org_permission and require_branch_in_org internal", () => {
    expect(migration).toMatch(
      /revoke all on function public\.require_org_permission\(uuid, text\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.require_branch_in_org\(uuid, uuid\) from public, anon, authenticated/,
    );
  });
});

describe("Phase 3.2b operations RPC migration - write path", () => {
  it("defines every operations RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const [fn] of [...CREATE_FNS, ...UPDATE_FNS]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create RPCs re-check an explicit permission via require_org_permission", () => {
    for (const [fn, permission] of CREATE_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(
        new RegExp(
          `perform public\\.require_org_permission\\(p_org_id, '${permission.replace(".", "\\.")}'\\)`,
        ),
      );
    }
  });

  it("update RPCs derive organization_id from the row and never take p_org_id", () => {
    for (const [fn, permission] of UPDATE_FNS) {
      const body = functionBody(fn);
      expect(body).not.toMatch(/p_org_id/);
      expect(body).toMatch(/select organization_id/);
      expect(body).toMatch(
        new RegExp(
          `perform public\\.require_org_permission\\(v_org_id, '${permission.replace(".", "\\.")}'\\)`,
        ),
      );
    }
  });

  it("branch-scoped writes re-check branch membership via require_branch_in_org", () => {
    expect(functionBody("create_membership")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(functionBody("create_attendance_record")).toMatch(
      /require_branch_in_org\(p_org_id, p_branch_id\)/,
    );
    expect(functionBody("create_pt_session")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(functionBody("create_class_booking")).toMatch(
      /require_branch_in_org\(p_org_id, p_branch_id\)/,
    );
    expect(functionBody("update_membership")).toMatch(/require_branch_in_org\(v_org_id, p_branch_id\)/);
    expect(functionBody("update_pt_session")).toMatch(/require_branch_in_org\(v_org_id, p_branch_id\)/);
  });

  it("never hard-deletes operations rows", () => {
    expect(migration).not.toMatch(
      /delete from public\.(memberships|membership_freezes|attendance_records|trainer_assignments|pt_sessions|class_sessions|class_bookings|workout_plans|diet_plans|body_measurements|progress_entries)/i,
    );
  });

  it("does not introduce a frozen member status", () => {
    expect(migration).not.toMatch(/'frozen'/);
  });

  it("membership statuses stay pending, active, expired or cancelled", () => {
    const body = functionBody("set_membership_status");
    expect(body).toMatch(/'pending', 'active', 'expired', 'cancelled'/);
    expect(body).not.toMatch(/'frozen'/);
  });
});
