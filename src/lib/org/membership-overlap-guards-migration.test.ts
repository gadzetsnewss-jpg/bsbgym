/**
 * Static migration invariant tests for membership overlap and freeze-window guards.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260927000020_membership_overlap_guards.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("membership overlap guard migration", () => {
  it("replaces create/update/renew/freeze with SECURITY DEFINER grants", () => {
    for (const fn of [
      "create_membership",
      "update_membership",
      "renew_membership",
      "create_membership_freeze",
    ]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create and update reject overlapping active memberships for the same member", () => {
    expect(functionBody("create_membership")).toMatch(
      /member already has an overlapping active membership/,
    );
    expect(functionBody("update_membership")).toMatch(
      /member already has an overlapping active membership/,
    );
    expect(functionBody("renew_membership")).toMatch(
      /member already has an overlapping active membership/,
    );
  });

  it("create computes end_date from plan duration_days when omitted", () => {
    const body = functionBody("create_membership");
    expect(body).toMatch(/coalesce\(p_end_date, v_start \+ \(v_plan\.duration_days \|\| ' days'\)::interval\)/);
    expect(body).toMatch(/plan is not active/);
  });

  it("renew starts after current end_date and uses plan duration_days", () => {
    const body = functionBody("renew_membership");
    expect(body).toMatch(/greatest\(v_existing\.end_date \+ 1/);
    expect(body).toMatch(/v_start \+ \(v_plan\.duration_days \|\| ' days'\)::interval/);
    expect(body).toMatch(/insert into public\.memberships/);
  });

  it("freeze rejects overlapping freeze windows and never sets gym_members frozen", () => {
    const body = functionBody("create_membership_freeze");
    expect(body).toMatch(/freeze overlaps an existing freeze for this membership/);
    expect(body).toMatch(/only active memberships can be frozen/);
    expect(body).toMatch(/freeze exceeds the plan freeze allowance/);
    expect(migration).not.toMatch(/'frozen'/);
    expect(migration).not.toMatch(/delete from public\./i);
    expect(migration).not.toMatch(/insert into public\.(invoices|payments|invoice_items)/);
  });
});
