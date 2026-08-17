/**
 * Static migration invariant tests (Phase 3 Part 2).
 *
 * There is no live database in this environment, so these tests validate the
 * migration source instead: the granular permission backfill, the audit-log
 * policy surface (select-only, no write policies), the role lifecycle RPCs and
 * the privilege-escalation guard. They are quick structural checks to catch
 * regressions when editing `20260817000003_rbac_roles_audit.sql`.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const MIGRATION_PATH = join(
  process.cwd(),
  "supabase",
  "migrations",
  "20260817000003_rbac_roles_audit.sql",
);
const migration = readFileSync(MIGRATION_PATH, "utf8");

describe("RBAC migration invariants", () => {
  it("adds an is_active flag to roles", () => {
    expect(migration).toMatch(/add column if not exists is_active boolean not null default true/);
  });

  it("creates the audit_logs table with an org index", () => {
    expect(migration).toMatch(/create table if not exists public\.audit_logs/);
    expect(migration).toMatch(/audit_logs_org_idx/);
  });

  it("audit_logs is select-only for org members (no write policies)", () => {
    expect(migration).toMatch(/create policy "org members can view audit logs"\s+on public\.audit_logs for select/);
    expect(migration).not.toMatch(/on public\.audit_logs for (insert|update|delete)/);
  });

  it("record_audit_event is SECURITY DEFINER and not granted to anon/authenticated", () => {
    expect(migration).toMatch(
      /create or replace function public\.record_audit_event[\s\S]*?security definer/,
    );
    expect(migration).not.toMatch(/grant execute on function public\.record_audit_event[\s\S]*?to (anon|authenticated)/);
  });

  it("registers audit triggers for organizations, invitations, members, branches, roles", () => {
    expect(migration).toMatch(/create trigger audit_organizations/);
    expect(migration).toMatch(/create trigger audit_invitations/);
    expect(migration).toMatch(/create trigger audit_organization_members/);
    expect(migration).toMatch(/create trigger audit_member_branches/);
    expect(migration).toMatch(/create trigger audit_roles/);
    expect(migration).toMatch(/create trigger audit_role_permissions/);
  });

  it("backfills coarse *.manage permissions into granular ones and removes the coarse rows", () => {
    expect(migration).toMatch(/delete from public\.role_permissions\s+where permission in \('members\.manage', 'memberships\.manage', 'billing\.manage', 'attendance\.manage'\)/);
    expect(migration).toMatch(/'members\.view'/);
    expect(migration).toMatch(/'members\.create'/);
    expect(migration).toMatch(/'members\.update'/);
    expect(migration).toMatch(/'members\.delete'/);
    expect(migration).toMatch(/'members\.export'/);
    expect(migration).toMatch(/'billing\.refund'/);
    expect(migration).toMatch(/'billing\.export'/);
    expect(migration).toMatch(/'reports\.view'/);
    expect(migration).toMatch(/'reports\.export'/);
  });

  it("seeds configurable default roles (receptionist, trainer, accountant)", () => {
    expect(migration).toMatch(/insert into public\.roles[\s\S]*'receptionist'/);
    expect(migration).toMatch(/insert into public\.roles[\s\S]*'trainer'/);
    expect(migration).toMatch(/insert into public\.roles[\s\S]*'accountant'/);
  });

  it("defines the role lifecycle RPCs", () => {
    for (const fn of ["create_role", "update_role", "set_role_permissions", "set_role_status"]) {
      expect(migration).toMatch(new RegExp(`create or replace function public\\.${fn}\\(`));
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("drops direct admin write policies on roles and role_permissions (RPC-only writes)", () => {
    expect(migration).toMatch(/drop policy if exists .* on public\.roles/);
    expect(migration).toMatch(/drop policy if exists .* on public\.role_permissions/);
  });

  it("enforces the privilege-escalation guard", () => {
    expect(migration).toMatch(/assert_caller_can_grant/);
    expect(migration).toMatch(/you cannot grant permissions you do not hold/);
  });

  it("guards role lifecycle: system roles cannot be deactivated, active roles cannot be deactivated", () => {
    expect(migration).toMatch(/system roles cannot be deactivated/);
    expect(migration).toMatch(/reassign members before deactivating this role/);
  });

  it("hardens invitations: owner role cannot be invited, owner-only admin invites", () => {
    expect(migration).toMatch(/the owner role cannot be invited/);
    expect(migration).toMatch(/only the owner can invite an admin/);
  });

  it("hardens role assignment: owner-only for owner/admin roles, single-owner rule", () => {
    expect(migration).toMatch(/only the owner can assign the owner or admin role/);
    expect(migration).toMatch(/this organization already has an owner/);
  });

  it("never logs passwords, tokens or invitation secrets", () => {
    expect(migration).toMatch(/invitation secrets are NEVER written to the audit log/i);
    // The audit helper / trigger must not touch token_hash or any secret column.
    const auditStart = migration.indexOf("create or replace function public.record_audit_event");
    const auditEnd = migration.indexOf("-- 4. RLS");
    const auditSection = migration.slice(auditStart, auditEnd >= 0 ? auditEnd : undefined);
    expect(auditSection).not.toMatch(/token_hash|access_token|refresh_token/);
  });
});
