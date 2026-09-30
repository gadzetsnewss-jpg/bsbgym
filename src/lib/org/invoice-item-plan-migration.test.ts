/**
 * Static migration invariant tests for invoice line membership plan links.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260930000023_invoice_item_plan.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("invoice item plan migration", () => {
  it("adds plan_id without creating or dropping plan tables", () => {
    expect(migration).toMatch(
      /alter table public\.invoice_items\s+add column if not exists plan_id uuid references public\.membership_plans\(id\) on delete set null/,
    );
    expect(migration).not.toMatch(/create table if not exists public\.membership_plans/i);
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/delete from public\./i);
  });

  it("keeps create_invoice signature and snapshots unit_price from item JSON", () => {
    const body = functionBody("create_invoice");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/v_price := coalesce\(\(v_item ->> 'unit_price'\)::numeric, 0\)/);
    expect(body).toMatch(/v_plan_id := nullif\(trim\(v_item ->> 'plan_id'\), ''\)::uuid/);
    expect(body).toMatch(/if v_type = 'membership' and v_plan_id is null then/);
    expect(body).toMatch(/membership plan is required/);
    expect(body).toMatch(/from public\.membership_plans p/);
    expect(body).toMatch(/p\.organization_id = p_org_id/);
    expect(body).toMatch(/hsn_sac, plan_id/);
    expect(body).not.toMatch(/v_price := .*membership_plans/);
    expect(migration).toMatch(
      /grant execute on function public\.create_invoice\([\s\S]*?to authenticated/,
    );
  });
});
