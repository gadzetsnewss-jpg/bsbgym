/**
 * Static migration invariant tests for the Phase 3.1 gym members migration.
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: the member statuses (no "frozen"), the per-organization
 * code uniqueness, branch-scoped RLS, the owner/admin-aware permission helper,
 * the SECURITY DEFINER RPCs and the absence of a trainers table / hard delete.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260914000008_phase_3_1_gym_members.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("Phase 3.1 gym members migration invariants", () => {
  it("defines the three member statuses and never uses frozen", () => {
    expect(migration).toMatch(
      /create type public\.gym_member_status as enum \('active', 'inactive', 'suspended'\)/,
    );
    expect(migration).not.toMatch(/gym_member_status[\s\S]*'frozen'/);
    expect(migration).not.toMatch(/'frozen'/);
  });

  it("enforces member code uniqueness per organization, not globally", () => {
    expect(functionBody("generate_gym_member_code")).toMatch(/exit when not exists/);
    expect(migration).toMatch(/unique \(organization_id, code\)/);
    expect(migration).not.toMatch(/code text not null unique\b/);
  });

  it("creates the gym_members table with a nullable trainer column and no trainers table", () => {
    expect(migration).toMatch(/create table if not exists public\.gym_members/);
    expect(migration).toMatch(/assigned_trainer_id uuid,/);
    expect(migration).not.toMatch(/assigned_trainer_id uuid references/);
    expect(migration).not.toMatch(/create table[^;]*\btrainers\b/i);
  });

  it("binds every branch to the same organization with a composite FK", () => {
    expect(migration).toMatch(
      /foreign key \(organization_id, branch_id\) references public\.branches\(organization_id, id\)/,
    );
  });

  it("enables RLS with a branch-scoped select policy and no direct write policies", () => {
    expect(migration).toMatch(/alter table public\.gym_members enable row level security/);
    expect(migration).toMatch(
      /on public\.gym_members for select[\s\S]*?public\.is_org_member\(organization_id\)[\s\S]*?public\.user_has_branch_access\(organization_id, branch_id\)/,
    );
    expect(migration).not.toMatch(/on public\.gym_members for (insert|update|delete)/);
  });

  it("resolves owner/admin as full org permissions and others via role_permissions", () => {
    const body = functionBody("user_has_permission");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
    expect(body).toMatch(/public\.is_org_admin\(p_org_id\)/);
    expect(body).toMatch(/join public\.role_permissions rp/);
    expect(body).toMatch(/rp\.permission = p_permission/);
    expect(migration).toMatch(
      /grant execute on function public\.user_has_permission\(uuid, text\) to authenticated/,
    );
  });

  it("keeps the code generator internal so it cannot be called over the API", () => {
    expect(migration).toMatch(
      /revoke all on function public\.generate_gym_member_code\(uuid\) from public, anon, authenticated/,
    );
  });

  it("defines the member RPCs as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const fn of ["create_gym_member", "update_gym_member", "set_gym_member_status"]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create_gym_member re-checks membership, permission and branch access", () => {
    const body = functionBody("create_gym_member");
    expect(body).toMatch(/if auth\.uid\(\) is null/);
    expect(body).toMatch(/if not public\.is_org_member\(p_org_id\)/);
    expect(body).toMatch(/if not public\.user_has_permission\(p_org_id, 'members\.create'\)/);
    expect(body).toMatch(/if not public\.user_has_branch_access\(p_org_id, p_branch_id\)/);
    expect(body).toMatch(/first name is required/);
    expect(body).toMatch(/last name is required/);
    expect(body).toMatch(/phone is required/);
  });

  it("update_gym_member derives the organization from the row and never trusts the client", () => {
    const body = functionBody("update_gym_member");
    expect(body).not.toMatch(/p_org_id/);
    expect(body).toMatch(/select organization_id, branch_id/);
    expect(body).toMatch(/if not public\.user_has_permission\(v_org_id, 'members\.update'\)/);
    expect(body).toMatch(/if not public\.user_has_branch_access\(v_org_id, v_old_branch\)/);
  });

  it("set_gym_member_status is soft-only and permission-checked", () => {
    const body = functionBody("set_gym_member_status");
    expect(body).toMatch(/user_has_permission\(v_org_id, v_required\)/);
    expect(body).toMatch(/'members\.delete'/);
    expect(body).toMatch(/'members\.update'/);
    expect(body).not.toMatch(/delete from public\.gym_members/);
  });

  it("never hard-deletes member records from any RPC", () => {
    expect(migration).not.toMatch(/delete from public\.gym_members/);
  });

  it("audits gym member lifecycle without logging secrets", () => {
    expect(migration).toMatch(/when 'gym_members' then/);
    expect(migration).toMatch(/gym_member\.created/);
    expect(migration).toMatch(/gym_member\.deactivated/);
    expect(migration).toMatch(/gym_member\.suspended/);
    expect(migration).toMatch(/gym_member\.reactivated/);
    expect(migration).toMatch(/create trigger audit_gym_members/);
    expect(migration).not.toMatch(/token_hash|access_token|refresh_token|password/);
  });
});
