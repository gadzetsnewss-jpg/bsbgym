/**
 * Static migration invariant tests for Phase 1.2 (20260831000005 + 000006).
 *
 * There is no live database in this environment, so these tests validate the
 * migration source: the tightened branches policy, the self-reference-free
 * `user_has_branch_access` overload, the composite FKs, the permission seed
 * (owner/admin full catalogue, trainer exclusion), the internal
 * `seed_default_role_permissions` ACL, and the invitation crypto fix.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const readMigration = (name: string): string =>
  readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");

const SECURITY = readMigration("20260831000005_phase_1_2_security.sql");
const CRYPTO = readMigration("20260831000006_phase_1_2_invitation_crypto_fix.sql");

describe("Phase 1.2 security migration invariants", () => {
  it("branches select policy requires org membership AND branch access", () => {
    expect(SECURITY).toMatch(
      /public\.is_org_member\(organization_id\)[\s\S]*?public\.user_has_branch_access\(organization_id, id\)/,
    );
  });

  it("adds a two-arg user_has_branch_access that never self-joins branches", () => {
    expect(SECURITY).toMatch(
      /create or replace function public\.user_has_branch_access\(p_org_id uuid, p_branch_id uuid\)/,
    );
    const twoArgStart = SECURITY.indexOf("user_has_branch_access(p_org_id uuid, p_branch_id uuid)");
    const twoArgSection = SECURITY.slice(twoArgStart, twoArgStart + 1200);
    expect(twoArgSection).not.toMatch(/from public\.branches/);
    expect(twoArgSection).toMatch(/from public\.organization_members m/);
  });

  it("grants execute on the two-arg overload to authenticated", () => {
    expect(SECURITY).toMatch(/grant execute on function public\.user_has_branch_access\(uuid, uuid\) to authenticated/);
  });

  it("adds composite org+branch foreign keys on member_branches and invitation_branches", () => {
    expect(SECURITY).toMatch(
      /member_branches_branch_org_fkey[\s\S]*?foreign key \(organization_id, branch_id\) references public\.branches\(organization_id, id\)/,
    );
    expect(SECURITY).toMatch(
      /invitation_branches_branch_org_fkey[\s\S]*?foreign key \(organization_id, branch_id\) references public\.branches\(organization_id, id\)/,
    );
  });

  it("defines seed_default_role_permissions as SECURITY DEFINER and revokes execution", () => {
    expect(SECURITY).toMatch(/create or replace function public\.seed_default_role_permissions\(p_org_id uuid\)[\s\S]*?security definer/);
    expect(SECURITY).toMatch(/revoke all on function public\.seed_default_role_permissions\(uuid\) from public, anon, authenticated/);
    expect(SECURITY).not.toMatch(/grant execute on function public\.seed_default_role_permissions[\s\S]*?to authenticated/);
  });

  it("owner and admin get the full catalogue; admin never gets organization.manage", () => {
    expect(SECURITY).toMatch(/r\.slug in \('owner', 'admin'\)/);
    expect(SECURITY).toMatch(/r\.slug = 'admin' and p\.permission = 'organization\.manage'/);
  });

  it("trainer is deliberately excluded from billing, gst, finance, reports, staff and organization", () => {
    expect(SECURITY).toMatch(/r\.slug = 'trainer'/);
    // Isolate the trainer INSERT's permission array literal.
    const whereIdx = SECURITY.indexOf("r.slug = 'trainer'");
    const arrayStart = SECURITY.lastIndexOf("unnest(array[", whereIdx);
    const arrayEnd = SECURITY.lastIndexOf("]) as p(permission)", whereIdx);
    const trainerPerms = SECURITY.slice(arrayStart, arrayEnd);
    for (const forbidden of ["'billing.", "'gst.", "'payments.", "'finance.", "'reports.", "'staff.", "'organization."]) {
      expect(trainerPerms).not.toMatch(new RegExp(forbidden.replace(".", "\\.")));
    }
    expect(trainerPerms).toMatch(/'trainers\.view'/);
    expect(trainerPerms).toMatch(/'classes\.view'/);
  });

  it("seeds the full catalogue for new organizations via create_organization", () => {
    expect(SECURITY).toMatch(/perform public\.seed_default_role_permissions\(v_org_id\)/);
  });

  it("backfills existing organizations insert-only (custom edits preserved)", () => {
    expect(SECURITY).toMatch(/for v_org in[\s\S]*?select id from public\.organizations[\s\S]*?perform public\.seed_default_role_permissions\(v_org\)/);
    expect(SECURITY).toMatch(/on conflict \(role_id, permission\) do nothing/);
  });
});

describe("Phase 1.2 invitation crypto fix migration invariants", () => {
  it("schema-qualifies gen_random_bytes and digest with the extensions schema", () => {
    expect(CRYPTO).toMatch(/extensions\.gen_random_bytes\(32\)/);
    expect(CRYPTO).toMatch(/extensions\.digest\(v_token, 'sha256'\)/);
    expect(CRYPTO).toMatch(/extensions\.digest\(p_token, 'sha256'\)/);
  });

  it("recreates both invitation RPCs and re-grants execute", () => {
    expect(CRYPTO).toMatch(/create or replace function public\.create_invitation\(/);
    expect(CRYPTO).toMatch(/create or replace function public\.accept_invitation\(p_token text\)/);
    expect(CRYPTO).toMatch(/grant execute on function public\.create_invitation\(uuid, text, uuid, uuid\[\], boolean, integer\) to authenticated/);
    expect(CRYPTO).toMatch(/grant execute on function public\.accept_invitation\(text\) to authenticated/);
  });

  it("keeps the hardened security rules intact", () => {
    expect(CRYPTO).toMatch(/the owner role cannot be invited/);
    expect(CRYPTO).toMatch(/only the owner can invite an admin/);
  });
});
