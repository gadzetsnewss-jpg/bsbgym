/**
 * Static migration invariant tests for onboarding Account/Branch/Preferences
 * persistence (20260922000017).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260922000017_onboarding_steps_persist.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("onboarding steps persist migration invariants", () => {
  it("defines step RPCs as SECURITY DEFINER granted only to authenticated", () => {
    for (const fn of [
      "save_onboarding_account",
      "save_onboarding_branch",
      "save_onboarding_preferences",
      "save_onboarding_business",
      "get_onboarding_organization",
    ]) {
      expect(functionBody(fn)).toMatch(/security definer/);
      expect(functionBody(fn)).toMatch(/if auth\.uid\(\) is null/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
      expect(migration).toMatch(
        new RegExp(`revoke all on function public\\.${fn}[\\s\\S]*?from public, anon`),
      );
    }
  });

  it("never trusts a client organization or branch id", () => {
    for (const fn of [
      "save_onboarding_account",
      "save_onboarding_branch",
      "save_onboarding_preferences",
      "save_onboarding_business",
    ]) {
      expect(functionBody(fn)).not.toMatch(/p_org_id/);
      expect(functionBody(fn)).not.toMatch(/p_branch_id/);
    }
  });

  it("save_onboarding_account updates the signed-in profile only", () => {
    const body = functionBody("save_onboarding_account");
    expect(body).toMatch(/update public\.profiles/);
    expect(body).toMatch(/where id = auth\.uid\(\)/);
    expect(body).toMatch(/first name is required/);
    expect(body).toMatch(/last name is required/);
  });

  it("save_onboarding_branch writes a draft setting, not a branches row", () => {
    const body = functionBody("save_onboarding_branch");
    expect(body).toMatch(/onboarding_branch/);
    expect(body).toMatch(/insert into public\.organization_settings/);
    expect(body).not.toMatch(/insert into public\.branches/);
    expect(body).toMatch(/branch name is required/);
    expect(body).toMatch(/branch code is required/);
  });

  it("save_onboarding_preferences updates the existing draft org", () => {
    const body = functionBody("save_onboarding_preferences");
    expect(body).toMatch(/update public\.organizations/);
    expect(body).toMatch(/currency is required/);
    expect(body).toMatch(/timezone is required/);
    expect(body).toMatch(/date format is required/);
    expect(body).not.toMatch(/insert into public\.organizations/);
  });

  it("get_onboarding_organization returns account, business, branch and preferences", () => {
    const body = functionBody("get_onboarding_organization");
    expect(body).toMatch(/'first_name'/);
    expect(body).toMatch(/'branch'/);
    expect(body).toMatch(/'currency'/);
    expect(body).toMatch(/'step'/);
  });
});
