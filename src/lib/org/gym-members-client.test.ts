/**
  * Static invariants for the gym members client (Phase 3.1).
  */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const client = readFileSync(
  join(process.cwd(), "src", "lib", "org", "gym-members.ts"),
  "utf8",
);

const updatePatch = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20260919000014_preserve_gym_member_trainer_on_update.sql",
  ),
  "utf8",
);

describe("gym members client", () => {
  it("disambiguates the branch embed so PostgREST can resolve dual FKs", () => {
    expect(client).toMatch(
      /branches!gym_members_branch_id_fkey\(id, name, code\), trainers!gym_members_assigned_trainer_fkey\(id, full_name, first_name, last_name\)/,
    );
    expect(client).not.toMatch(/branches\(id, name, code\)/);
  });

  it("does not send p_assigned_trainer_id from the Members form payload", () => {
    expect(client).not.toMatch(/p_assigned_trainer_id/);
  });

  it("scopes list and get queries to organization_id", () => {
    expect(client).toMatch(/\.eq\("organization_id", filters\.organizationId\)/);
    expect(client).toMatch(/\.eq\("organization_id", organizationId\)/);
  });

  it("filters the member list by assigned trainer, including unassigned", () => {
    expect(client).toMatch(/trainerId\?: string \| "all" \| "unassigned"/);
    expect(client).toMatch(/query\.is\("assigned_trainer_id", null\)/);
    expect(client).toMatch(/query\.eq\("assigned_trainer_id", filters\.trainerId\)/);
  });

  it("loads related attendance, trainer assignments, workout plans, and activity by member", () => {
    expect(client).toMatch(/\.from\("attendance_records"/);
    expect(client).toMatch(/\.eq\("member_id" as "id", memberId\)/);
    expect(client).toMatch(/\.from\("trainer_assignments"/);
    expect(client).toMatch(/\.from\("workout_plans"/);
    expect(client).toMatch(/\.from\("audit_logs"/);
    expect(client).toMatch(/\.eq\("target_type", "gym_member"\)/);
    expect(client).toMatch(/\.from\("trainers"/);
  });

  it("mutates only through SECURITY DEFINER RPCs", () => {
    expect(client).toMatch(/supabase\.rpc\("create_gym_member"/);
    expect(client).toMatch(/supabase\.rpc\("update_gym_member"/);
    expect(client).toMatch(/supabase\.rpc\("set_gym_member_status"/);
    expect(client).not.toMatch(/\.from\("gym_members"\)[\s\S]{0,80}\.(insert|update|delete)\(/);
  });
});

describe("update_gym_member trainer preservation patch", () => {
  it("replaces update_gym_member without clearing assigned_trainer_id", () => {
    expect(updatePatch).toMatch(/create or replace function public\.update_gym_member/);
    expect(updatePatch).toMatch(/security definer/);
    expect(updatePatch).toMatch(/user_has_permission\(v_org_id, 'members\.update'\)/);
    const bodyStart = updatePatch.indexOf("as $$");
    const body = updatePatch.slice(bodyStart);
    expect(body).not.toMatch(/assigned_trainer_id = null/);
    expect(body).not.toMatch(/assigned_trainer_id = p_assigned_trainer_id/);
  });
});
