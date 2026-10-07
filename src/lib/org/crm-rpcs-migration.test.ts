/**
 * Static migration invariant tests for Phase 6 CRM write RPCs.
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: SECURITY DEFINER write RPCs, permission/branch re-checks,
 * reuse of existing CRM tables, and the absence of hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261007000028_crm_write_rpcs.sql"),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const CREATE_FNS = [
  ["create_lead", "crm.manage"],
  ["create_follow_up", "crm.manage"],
  ["create_trial_membership", "crm.manage"],
  ["create_referral", "crm.manage"],
] as const;

const UPDATE_FNS = [
  ["update_lead", "crm.manage"],
  ["update_follow_up", "crm.manage"],
  ["update_trial_membership", "crm.manage"],
  ["update_referral", "crm.manage"],
] as const;

describe("CRM RPC migration - write path", () => {
  it("defines every CRM RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const [fn] of [...CREATE_FNS, ...UPDATE_FNS, ["convert_lead_to_member"] as const]) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("create RPCs re-check crm.manage via require_org_permission", () => {
    for (const [fn, permission] of CREATE_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(
        new RegExp(
          `perform public\\.require_org_permission\\(p_org_id, '${permission.replace(".", "\\.")}'\\)`,
        ),
      );
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

  it("convert_lead_to_member reuses gym_members and generate_gym_member_code", () => {
    const body = functionBody("convert_lead_to_member");
    expect(body).toMatch(/insert into public\.gym_members/);
    expect(body).toMatch(/generate_gym_member_code/);
    expect(body).toMatch(/converted_member_id/);
    expect(body).toMatch(/status = 'converted'/);
    expect(body).toMatch(/require_org_permission\(v_lead\.organization_id, 'crm\.manage'\)/);
    expect(body).toMatch(/require_org_permission\(v_lead\.organization_id, 'members\.create'\)/);
    expect(body).not.toMatch(/p_org_id/);
  });

  it("keeps existing lead statuses and does not invent new ones", () => {
    expect(functionBody("create_lead")).toMatch(
      /'new', 'contacted', 'qualified', 'trial', 'lost'/,
    );
    expect(functionBody("create_follow_up")).toMatch(/'pending'/);
    expect(functionBody("create_trial_membership")).toMatch(/'scheduled'/);
    expect(functionBody("create_referral")).toMatch(/'pending'/);
    expect(migration).not.toMatch(/'commission'/);
  });

  it("never hard-deletes CRM rows", () => {
    expect(migration).not.toMatch(
      /delete from public\.(leads|follow_ups|trial_memberships|referrals|gym_members)/i,
    );
  });

  it("reuses existing CRM tables instead of creating new ones", () => {
    expect(migration).not.toMatch(/create table/i);
    expect(migration).toMatch(/insert into public\.leads/);
    expect(migration).toMatch(/insert into public\.follow_ups/);
    expect(migration).toMatch(/insert into public\.trial_memberships/);
    expect(migration).toMatch(/insert into public\.referrals/);
  });
});
