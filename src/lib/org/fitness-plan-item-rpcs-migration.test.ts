/**
 * Static migration invariant tests for workout/diet plan item write RPCs.
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: SECURITY DEFINER write RPCs, permission re-checks, and
 * the absence of hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261005000027_fitness_plan_item_rpcs.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const CREATE_FNS = [
  ["create_workout_plan_item", "fitness.manage"],
  ["create_diet_plan_item", "fitness.manage"],
] as const;

const UPDATE_FNS = [
  ["update_workout_plan_item", "fitness.manage"],
  ["update_diet_plan_item", "fitness.manage"],
] as const;

describe("Fitness plan item RPC migration - write path", () => {
  it("defines every plan-item RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const [fn] of [...CREATE_FNS, ...UPDATE_FNS]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create RPCs re-check fitness.manage and the parent plan org", () => {
    for (const [fn, permission] of CREATE_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(
        new RegExp(
          `perform public\\.require_org_permission\\(p_org_id, '${permission.replace(".", "\\.")}'\\)`,
        ),
      );
      expect(body).toMatch(/raise exception 'plan not found'/);
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

  it("never hard-deletes plan item rows", () => {
    expect(migration).not.toMatch(
      /delete from public\.(workout_plan_items|diet_plan_items)/i,
    );
  });

  it("reuses existing workout_plan_items and diet_plan_items tables", () => {
    expect(migration).not.toMatch(/create table/i);
    expect(migration).toMatch(/insert into public\.workout_plan_items/);
    expect(migration).toMatch(/insert into public\.diet_plan_items/);
  });
});
