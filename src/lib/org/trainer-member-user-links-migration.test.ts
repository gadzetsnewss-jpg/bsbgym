/**
 * Static migration invariant tests for trainer/member login links.
 *
 * No live database in this environment, so these tests validate the migration
 * source: nullable user_id columns, member role seed, scoped SELECT, link
 * RPCs, and linked-trainer PT status.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261024000034_trainer_member_user_links.sql"),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

describe("trainer/member login-link migration", () => {
  it("adds nullable user_id columns unique per organization", () => {
    expect(migration).toMatch(/alter table public\.trainers[\s\S]*add column if not exists user_id uuid/);
    expect(migration).toMatch(/alter table public\.gym_members[\s\S]*add column if not exists user_id uuid/);
    expect(migration).toMatch(/create unique index if not exists trainers_org_user_unique/);
    expect(migration).toMatch(/create unique index if not exists gym_members_org_user_unique/);
    expect(migration).not.toMatch(/drop table/i);
  });

  it("seeds a non-system member role with view permissions", () => {
    expect(migration).toMatch(/'Member', 'member'/);
    expect(migration).toMatch(/'Gym customer with access to their own training'/);
    expect(migration).toMatch(/r\.slug = 'member'/);
    const seed = functionBody("seed_default_role_permissions");
    expect(seed).toMatch(/'dashboard\.view'/);
    expect(seed).toMatch(/'members\.view'/);
    expect(seed).toMatch(/'memberships\.view'/);
    expect(seed).toMatch(/'trainers\.view'/);
  });

  it("keeps helpers internal and scopes SELECT through can_view_member_data", () => {
    expect(migration).toMatch(/create or replace function public\.current_org_role_slug\(p_org_id uuid\)/);
    expect(migration).toMatch(/create or replace function public\.linked_trainer_id\(p_org_id uuid\)/);
    expect(migration).toMatch(/create or replace function public\.linked_gym_member_id\(p_org_id uuid\)/);
    expect(migration).toMatch(/create or replace function public\.can_view_member_data\(p_org_id uuid, p_member_id uuid\)/);
    expect(migration).toMatch(
      /revoke all on function public\.current_org_role_slug\(uuid\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.linked_trainer_id\(uuid\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.linked_gym_member_id\(uuid\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.can_view_member_data\(uuid, uuid\) from public, anon, authenticated/,
    );
    expect(functionBody("can_view_member_data")).toMatch(/a\.status = 'active'/);
    expect(migration).toMatch(/public\.can_view_member_data\(organization_id, id\)/);
    expect(migration).toMatch(/public\.can_view_member_data\(organization_id, member_id\)/);
  });

  it("requires users.manage and matching role slug on link RPCs", () => {
    const trainer = functionBody("link_trainer_user");
    expect(trainer).toMatch(/security definer/);
    expect(trainer).toMatch(/require_org_permission\(v_org_id, 'users\.manage'\)/);
    expect(trainer).toMatch(/user must have the trainer role/);
    expect(trainer).toMatch(/login is already linked to a member/);
    const member = functionBody("link_gym_member_user");
    expect(member).toMatch(/require_org_permission\(v_org_id, 'users\.manage'\)/);
    expect(member).toMatch(/user must have the member role/);
    expect(member).toMatch(/login is already linked to a trainer/);
    expect(migration).toMatch(/grant execute on function public\.link_trainer_user\(uuid, uuid\) to authenticated/);
    expect(migration).toMatch(/grant execute on function public\.link_gym_member_user\(uuid, uuid\) to authenticated/);
  });

  it("lets linked trainers set PT status without trainers.edit", () => {
    const body = functionBody("set_pt_session_status");
    expect(body).toMatch(/user_has_permission\(v_org_id, 'trainers\.edit'\)/);
    expect(body).toMatch(/linked_trainer_id\(v_org_id\) is not distinct from v_trainer/);
    expect(body).toMatch(/p_status not in \('scheduled', 'completed', 'cancelled', 'no_show'\)/);
    expect(body).not.toMatch(/create_pt_session/);
    expect(body).not.toMatch(/update_pt_session/);
  });
});

describe("trainer/member login-link COMBINE.sql", () => {
  it("includes the linking migration", () => {
    expect(combine).toMatch(/20261024000034_trainer_member_user_links\.sql/);
    expect(combine).toMatch(/create or replace function public\.link_trainer_user/);
    expect(combine).toMatch(/create or replace function public\.can_view_member_data/);
  });
});
