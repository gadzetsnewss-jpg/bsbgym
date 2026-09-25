/**
 * Static migration invariant tests for Phase 1.3 (20260913000007).
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: owner-only org profile updates, admin-only preferences
 * and branch lifecycle, last-active-branch protection, immutable branch
 * codes, and org-settings upserts that re-check admin from auth.uid().
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260913000007_phase_1_3_org_branch_settings.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("Phase 1.3 org/branch/settings migration invariants", () => {
  it("defines the settings RPCs as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const fn of [
      "update_organization",
      "update_organization_preferences",
      "create_branch",
      "update_branch",
      "set_branch_status",
      "upsert_organization_setting",
    ]) {
      expect(migration).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
      expect(functionBody(fn)).toMatch(/security definer/);
      expect(functionBody(fn)).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("update_organization is owner-only and never trusts organization_id alone", () => {
    const body = functionBody("update_organization");
    expect(body).toMatch(/if auth\.uid\(\) is null/);
    expect(body).toMatch(/if not public\.is_org_owner\(p_org_id\)/);
    expect(body).not.toMatch(/is_org_admin\(p_org_id\)/);
    expect(body).toMatch(/organization name is required/);
  });

  it("update_organization_preferences is admin-only so general settings does not need organization.manage", () => {
    const body = functionBody("update_organization_preferences");
    expect(body).toMatch(/if not public\.is_org_admin\(p_org_id\)/);
    expect(body).toMatch(/currency is required/);
    expect(body).toMatch(/timezone is required/);
    expect(body).toMatch(/date format is required/);
    expect(body).not.toMatch(/is_org_owner/);
  });

  it("create_branch validates code uniqueness and grants the creating admin access when needed", () => {
    const body = functionBody("create_branch");
    expect(body).toMatch(/if not public\.is_org_admin\(p_org_id\)/);
    expect(body).toMatch(/branch code is required/);
    expect(body).toMatch(/branch code may only contain letters, numbers, dashes or underscores/);
    expect(body).toMatch(/branch code already exists/);
    expect(body).toMatch(/insert into public\.member_branches/);
  });

  it("update_branch never changes the branch code", () => {
    const body = functionBody("update_branch");
    expect(body).not.toMatch(/p_code/);
    expect(body).not.toMatch(/^\s+code\s*=/m);
  });

  it("set_branch_status refuses to deactivate the last active branch", () => {
    const body = functionBody("set_branch_status");
    expect(body).toMatch(/cannot deactivate the last active branch/);
    expect(body).toMatch(/if not public\.is_org_admin\(v_org_id\)/);
  });

  it("upsert_organization_setting re-checks admin from auth.uid()", () => {
    const body = functionBody("upsert_organization_setting");
    expect(body).toMatch(/if auth\.uid\(\) is null/);
    expect(body).toMatch(/if not public\.is_org_admin\(p_org_id\)/);
    expect(body).toMatch(/setting key is required/);
    expect(body).toMatch(/setting key is invalid/);
  });

  it("audits organization updates and branch lifecycle without logging secrets", () => {
    expect(migration).toMatch(/v_action := 'organization\.updated'/);
    expect(migration).toMatch(/v_action := 'branch\.created'/);
    expect(migration).toMatch(/v_action := 'branch\.updated'/);
    expect(migration).toMatch(/branch\.reactivated/);
    expect(migration).toMatch(/branch\.deactivated/);
    expect(migration).toMatch(/create trigger audit_organizations/);
    expect(migration).toMatch(/create trigger audit_branches/);
    expect(migration).not.toMatch(/token_hash|access_token|refresh_token|password/);
  });
});
