/**
 * Static invariants for the live create_trainer_assignment RPC install.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261027000036_create_trainer_assignment_rpc.sql"),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");
const original = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260916000013_phase_3_2b_operations_rpcs.sql"),
  "utf8",
);

function functionBody(source: string, name: string): string {
  const start = source.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = source.indexOf("create or replace function public.", start + 1);
  return source.slice(start, next >= 0 ? next : undefined);
}

describe("create_trainer_assignment live install", () => {
  it("reuses the Phase 3.2b assignment RPC without a competing table", () => {
    expect(migration).toMatch(/create or replace function public\.create_trainer_assignment\(/);
    expect(migration).toMatch(/create or replace function public\.set_trainer_assignment_status\(/);
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/disable row level security/i);
    expect(functionBody(migration, "create_trainer_assignment")).toMatch(
      /require_org_permission\(p_org_id, 'trainers\.assign'\)/,
    );
    expect(functionBody(migration, "create_trainer_assignment")).toMatch(
      /set assigned_trainer_id = p_trainer_id/,
    );
    expect(functionBody(migration, "create_trainer_assignment")).toMatch(/status = 'ended'/);
    expect(functionBody(migration, "set_trainer_assignment_status")).toMatch(
      /require_org_permission\(v_org_id, 'trainers\.reassign'\)/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.create_trainer_assignment\(uuid, uuid, uuid, date, text\) to authenticated/,
    );
  });

  it("keeps the original operations RPC signature", () => {
    expect(functionBody(migration, "create_trainer_assignment")).toMatch(
      /p_org_id uuid,\s*p_trainer_id uuid,\s*p_member_id uuid,\s*p_assigned_at date,\s*p_notes text/,
    );
    expect(functionBody(original, "create_trainer_assignment")).toMatch(
      /p_org_id uuid,\s*p_trainer_id uuid,\s*p_member_id uuid,\s*p_assigned_at date,\s*p_notes text/,
    );
  });

  it("is included in COMBINE.sql", () => {
    expect(combine).toMatch(/20261027000036_create_trainer_assignment_rpc\.sql/);
    expect(combine).toMatch(/create or replace function public\.create_trainer_assignment\(/);
  });
});
