/**
 * Static migration invariant tests for Phase 10 production hardening.
 *
 * No live database in this environment, so these tests validate the migration
 * source: leftover write policies are dropped, privileged profile columns are
 * protected, and child-table SELECT inherits parent branch access.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261023000033_phase_10_hardening.sql"),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");

describe("Phase 10 hardening migration", () => {
  it("is additive and never drops tables, columns or RPCs", () => {
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/drop column/i);
    expect(migration).not.toMatch(/drop function/i);
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/alter table .* add column/i);
  });

  it("drops leftover REST write policies on org, branches, settings and subscriptions", () => {
    expect(migration).toMatch(
      /drop policy if exists "org owner can update their organization" on public\.organizations/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can create branches" on public\.branches/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can update branches" on public\.branches/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can manage organization settings" on public\.organization_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can update organization settings" on public\.organization_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can delete organization settings" on public\.organization_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can manage branch settings" on public\.branch_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can update branch settings" on public\.branch_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can delete branch settings" on public\.branch_settings/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can manage subscriptions" on public\.organization_subscriptions/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can update subscriptions" on public\.organization_subscriptions/,
    );
    expect(migration).toMatch(
      /drop policy if exists "org admins can delete subscriptions" on public\.organization_subscriptions/,
    );
  });

  it("does not re-create those write policies", () => {
    expect(migration).not.toMatch(/create policy "org owner can update their organization"/);
    expect(migration).not.toMatch(/create policy "org admins can create branches"/);
    expect(migration).not.toMatch(/create policy "org admins can manage organization settings"/);
    expect(migration).not.toMatch(/create policy "org admins can manage branch settings"/);
    expect(migration).not.toMatch(/create policy "org admins can manage subscriptions"/);
  });

  it("blocks privileged profile column changes while keeping username protection", () => {
    expect(migration).toMatch(/create or replace function public\.protect_profile_username\(\)/);
    expect(migration).toMatch(/username cannot be changed/);
    expect(migration).toMatch(/profile status cannot be changed/);
    expect(migration).toMatch(/profile organization cannot be changed/);
    expect(migration).toMatch(/profile branch cannot be changed/);
    expect(migration).toMatch(/profile email cannot be changed/);
    expect(migration).toMatch(
      /revoke all on function public\.protect_profile_username\(\) from public, anon, authenticated/,
    );
  });

  it("scopes child-table SELECT through parent branch access", () => {
    for (const table of [
      "invoice_items",
      "installments",
      "pos_sale_items",
      "purchase_items",
      "credit_note_items",
      "membership_freezes",
      "class_bookings",
    ]) {
      expect(migration).toMatch(
        new RegExp(`if to_regclass\\('public\\.${table}'\\) is null then`),
      );
      expect(migration).toMatch(
        new RegExp(`create policy "org members can view [\\w ]+"\\s+on public\\.${table} for select`),
      );
    }
    expect(migration).toMatch(/from public\.invoices parent/);
    expect(migration).toMatch(/from public\.pos_sales parent/);
    expect(migration).toMatch(/from public\.purchases parent/);
    expect(migration).toMatch(/from public\.credit_notes parent/);
    expect(migration).toMatch(/from public\.memberships parent/);
    expect(migration).toMatch(/from public\.class_sessions parent/);
    expect(migration).toMatch(/user_has_branch_access\(parent\.organization_id, parent\.branch_id\)/);
  });

  it("never grants execute on helpers to anon", () => {
    expect(migration).not.toMatch(/to anon/);
  });
});

describe("Phase 10 COMBINE.sql", () => {
  it("includes the hardening migration", () => {
    expect(combine).toMatch(/20261023000033_phase_10_hardening\.sql/);
    expect(combine).toMatch(/profile status cannot be changed/);
    expect(combine).toMatch(/drop policy if exists "org owner can update their organization"/);
  });
});
