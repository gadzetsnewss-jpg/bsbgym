/**
 * Static migration invariant tests for Phase 8 (expenses + other income).
 *
 * No live database in this environment, so these tests validate the migration
 * source: SECURITY DEFINER write RPCs, permission/branch re-checks, reuse of
 * the existing expenses/income_entries tables, and the absence of hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261014000031_finance_expenses_income_rpcs.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const PUBLIC_FNS = [
  "create_expense",
  "update_expense",
  "create_income_entry",
  "update_income_entry",
] as const;

describe("Phase 8 finance RPC migration", () => {
  it("defines every public RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const fn of PUBLIC_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create RPCs re-check finance.manage and branch membership", () => {
    expect(functionBody("create_expense")).toMatch(
      /require_org_permission\(p_org_id, 'finance\.manage'\)/,
    );
    expect(functionBody("create_expense")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(functionBody("create_income_entry")).toMatch(
      /require_org_permission\(p_org_id, 'finance\.manage'\)/,
    );
    expect(functionBody("create_income_entry")).toMatch(
      /require_branch_in_org\(p_org_id, p_branch_id\)/,
    );
  });

  it("row-scoped RPCs derive organization_id from the row", () => {
    for (const fn of ["update_expense", "update_income_entry"]) {
      const body = functionBody(fn);
      expect(body).not.toMatch(/p_org_id/);
      expect(body).toMatch(/require_org_permission\(v_/);
      expect(body).toMatch(/require_branch_in_org\(v_/);
    }
  });

  it("reuses the existing expenses and income_entries tables", () => {
    expect(migration).toMatch(/insert into public\.expenses/);
    expect(migration).toMatch(/insert into public\.income_entries/);
    expect(migration).toMatch(/update public\.expenses set/);
    expect(migration).toMatch(/update public\.income_entries set/);
    expect(migration).not.toMatch(/create table/i);
  });

  it("never hard-deletes financial records", () => {
    expect(migration).not.toMatch(/delete from public\.(expenses|income_entries)\b/i);
  });

  it("rounds money and rejects invalid amounts, methods and statuses", () => {
    expect(functionBody("create_expense")).toMatch(/round_money\(p_amount\)/);
    expect(functionBody("create_expense")).toMatch(/expense amount must be greater than zero/);
    expect(functionBody("create_expense")).toMatch(/expense category is required/);
    expect(functionBody("create_expense")).toMatch(/'pending', 'paid'/);
    expect(functionBody("create_income_entry")).toMatch(/income amount must be greater than zero/);
    expect(functionBody("create_income_entry")).toMatch(
      /'cash', 'card', 'upi', 'netbanking', 'wallet', 'cheque', 'bank_transfer', 'other'/,
    );
  });
});

describe("Phase 8 acceptance-scenario guards", () => {
  it("A: recording an expense writes the existing expenses table", () => {
    expect(functionBody("create_expense")).toMatch(/insert into public\.expenses/);
    expect(functionBody("create_expense")).toMatch(/status, reference, created_by/);
  });

  it("B: other income writes income_entries and never a payment duplicate", () => {
    expect(functionBody("create_income_entry")).toMatch(/insert into public\.income_entries/);
    expect(functionBody("create_income_entry")).not.toMatch(/insert into public\.payments/);
    expect(functionBody("create_income_entry")).not.toMatch(/insert into public\.invoices/);
  });

  it("F: purchases are never auto-copied into expenses", () => {
    expect(migration).not.toMatch(/insert into public\.expenses[\s\S]*purchase/i);
    expect(migration).not.toMatch(/from public\.purchases/);
  });

  it("K/L: writes re-check finance.manage and branch membership", () => {
    for (const fn of PUBLIC_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(/require_org_permission\([^\n]+, 'finance\.manage'\)/);
      expect(body).toMatch(/require_branch_in_org\(/);
    }
  });

  it("M: financial history is preserved (no hard deletes)", () => {
    expect(migration).not.toMatch(/delete from public\.(expenses|income_entries)\b/i);
  });
});
