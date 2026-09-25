/**
 * Static migration invariant tests for membership lifecycle RPCs.
 *
 * Validates extend/renew SECURITY DEFINER writes, freeze allowance re-check,
 * and the absence of frozen member status / billing side effects.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260923000018_membership_lifecycle_rpcs.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("membership lifecycle RPC migration", () => {
  it("defines extend and renew as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const fn of ["extend_membership", "renew_membership"]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("extend derives organization_id from the membership row and checks memberships.extend", () => {
    const body = functionBody("extend_membership");
    expect(body).not.toMatch(/p_org_id/);
    expect(body).toMatch(/select organization_id, status into v_org_id, v_status/);
    expect(body).toMatch(/require_org_permission\(v_org_id, 'memberships\.extend'\)/);
    expect(body).toMatch(/only active memberships can be extended/);
  });

  it("renew creates a new membership and never writes invoices or payments", () => {
    const body = functionBody("renew_membership");
    expect(body).toMatch(/insert into public\.memberships/);
    expect(body).toMatch(/require_org_permission\(v_existing\.organization_id, 'memberships\.create'\)/);
    expect(migration).not.toMatch(/insert into public\.(invoices|payments|invoice_items)/);
  });

  it("freeze re-checks memberships.freeze, active status and plan freeze allowance", () => {
    const body = functionBody("create_membership_freeze");
    expect(body).toMatch(/require_org_permission\(p_org_id, 'memberships\.freeze'\)/);
    expect(body).toMatch(/only active memberships can be frozen/);
    expect(body).toMatch(/freeze exceeds the plan freeze allowance/);
    expect(body).toMatch(/end_date = end_date \+ \(v_days \|\| ' days'\)::interval/);
  });

  it("never introduces a frozen member status or hard deletes", () => {
    expect(migration).not.toMatch(/'frozen'/);
    expect(migration).not.toMatch(/delete from public\./i);
    expect(migration).not.toMatch(/gym_members[\s\S]*status/);
  });
});
