/**
 * Static migration invariant tests for Phase 3.2a catalog write RPCs.
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: fitness permission seed, SECURITY DEFINER write RPCs,
 * permission/membership/branch re-checks, and the absence of hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { ALL_PERMISSIONS } from "@/lib/auth/permissions";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260915000012_phase_3_2a_catalog_rpcs.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const CREATE_FNS = [
  ["create_trainer", "trainers.create"],
  ["create_membership_plan", "memberships.create"],
  ["create_gst_rate", "gst.manage"],
  ["create_exercise", "fitness.manage"],
  ["create_class_template", "classes.manage"],
  ["create_product", "inventory.manage"],
  ["create_supplier", "inventory.manage"],
] as const;

const UPDATE_FNS = [
  ["update_trainer", "trainers.edit"],
  ["update_membership_plan", "memberships.update"],
  ["update_gst_rate", "gst.manage"],
  ["update_exercise", "fitness.manage"],
  ["update_class_template", "classes.manage"],
  ["update_product", "inventory.manage"],
  ["update_supplier", "inventory.manage"],
] as const;

const STATUS_FNS = [
  "set_trainer_status",
  "set_membership_plan_status",
  "set_gst_rate_status",
  "set_exercise_status",
  "set_class_template_status",
  "set_product_status",
  "set_supplier_status",
] as const;

describe("Phase 3.2a catalog RPC migration - permissions", () => {
  it("seeds fitness.view and fitness.manage into the owner catalogue", () => {
    const body = functionBody("seed_default_role_permissions");
    expect(body).toMatch(/'fitness\.view', 'fitness\.manage'/);
    expect(ALL_PERMISSIONS).toContain("fitness.view");
    expect(ALL_PERMISSIONS).toContain("fitness.manage");
  });

  it("keeps seed_default_role_permissions internal", () => {
    expect(migration).toMatch(
      /revoke all on function public\.seed_default_role_permissions\(uuid\) from public, anon, authenticated/,
    );
  });

  it("trainer still has no billing, gst, finance, reports, staff or organization", () => {
    const whereIdx = migration.indexOf("r.slug = 'trainer'");
    const arrayStart = migration.lastIndexOf("unnest(array[", whereIdx);
    const arrayEnd = migration.lastIndexOf("]) as p(permission)", whereIdx);
    const trainerPerms = migration.slice(arrayStart, arrayEnd);
    for (const forbidden of [
      "'billing.",
      "'gst.",
      "'payments.",
      "'finance.",
      "'reports.",
      "'staff.",
      "'organization.",
    ]) {
      expect(trainerPerms).not.toMatch(new RegExp(forbidden.replace(".", "\\.")));
    }
    expect(trainerPerms).toMatch(/'fitness\.view'/);
    expect(trainerPerms).toMatch(/'fitness\.manage'/);
  });
});

describe("Phase 3.2a catalog RPC migration - write path", () => {
  it("defines every catalog RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const [fn] of [...CREATE_FNS, ...UPDATE_FNS]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
    for (const fn of STATUS_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}\\(uuid, boolean\\) to authenticated`),
      );
    }
  });

  it("create RPCs re-check auth, membership and an explicit permission", () => {
    for (const [fn, permission] of CREATE_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(/if auth\.uid\(\) is null/);
      expect(body).toMatch(/if not public\.is_org_member\(p_org_id\)/);
      expect(body).toMatch(
        new RegExp(`if not public\\.user_has_permission\\(p_org_id, '${permission.replace(".", "\\.")}'\\)`),
      );
    }
  });

  it("update RPCs derive organization_id from the row and never take p_org_id", () => {
    for (const [fn, permission] of UPDATE_FNS) {
      const body = functionBody(fn);
      expect(body).not.toMatch(/p_org_id/);
      expect(body).toMatch(/select organization_id into v_org_id/);
      expect(body).toMatch(
        new RegExp(`if not public\\.user_has_permission\\(v_org_id, '${permission.replace(".", "\\.")}'\\)`),
      );
    }
  });

  it("branch-scoped writes re-check user_has_branch_access", () => {
    expect(functionBody("create_trainer")).toMatch(/user_has_branch_access\(p_org_id, p_branch_id\)/);
    expect(functionBody("create_class_template")).toMatch(/user_has_branch_access\(p_org_id, p_branch_id\)/);
    expect(functionBody("update_class_template")).toMatch(/user_has_branch_access\(v_org_id, p_branch_id\)/);
  });

  it("never hard-deletes catalog rows", () => {
    expect(migration).not.toMatch(/delete from public\.(trainers|membership_plans|gst_rates|exercises|class_templates|products|suppliers)/i);
  });

  it("does not introduce a frozen member status", () => {
    expect(migration).not.toMatch(/'frozen'/);
  });
});
