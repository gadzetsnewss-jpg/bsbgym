/**
 * Static migration invariant tests for onboarding Business persistence
 * (20260921000016).
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: draft save/get RPCs, UPDATE-not-insert when a draft exists,
 * and create_organization never creating a second org for the same user.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260921000016_onboarding_business_persist.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("onboarding Business persist migration invariants", () => {
  it("defines save/get RPCs as SECURITY DEFINER granted only to authenticated", () => {
    for (const fn of ["save_onboarding_business", "get_onboarding_organization"]) {
      expect(migration).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
      expect(functionBody(fn)).toMatch(/security definer/);
      expect(functionBody(fn)).toMatch(/set search_path = public/);
      expect(functionBody(fn)).toMatch(/if auth\.uid\(\) is null/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon`),
      );
    }
  });

  it("save_onboarding_business never trusts a client organization id", () => {
    const body = functionBody("save_onboarding_business");
    expect(body).not.toMatch(/p_org_id/);
    expect(body).toMatch(/created_by = auth\.uid\(\)/);
    expect(body).toMatch(/organization name is required/);
    expect(body).toMatch(/you already belong to an organization/);
  });

  it("save_onboarding_business updates an existing draft instead of inserting a second org", () => {
    const body = functionBody("save_onboarding_business");
    expect(body).toMatch(/update public\.organizations/);
    expect(body).toMatch(/insert into public\.organizations/);
    expect(body).toMatch(/not exists \(\s*select 1\s*from public\.organization_members m/);
  });

  it("create_organization reuses the draft org and still seeds roles", () => {
    const body = functionBody("create_organization");
    expect(body).toMatch(/you already belong to an organization/);
    expect(body).toMatch(/update public\.organizations/);
    expect(body).toMatch(/perform public\.seed_default_role_permissions\(v_org_id\)/);
    expect(body).toMatch(/insert into public\.organization_members/);
    expect(body).toMatch(/insert into public\.branches/);
  });
});
