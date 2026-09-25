/**
 * Static migration invariant tests for the Phase 3.2 module migrations.
 *
 * There is no live database in this environment, so these tests validate the
 * migration sources: the additive catalog/operations/commerce tables, RLS on
 * every table, select-only policies (no direct write policies), branch-scoped
 * reads, the recipient-scoped notifications policy, the real trainers
 * relationship reserved by Phase 3.1 and the absence of hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function readMigration(name: string): string {
  return readFileSync(join(process.cwd(), "supabase", "migrations", name), "utf8");
}

const catalog = readMigration("20260914000009_phase_3_2_catalog.sql");
const operations = readMigration("20260914000010_phase_3_2_operations.sql");
const commerce = readMigration("20260914000011_phase_3_2_commerce_crm.sql");

const migrations = [catalog, operations, commerce];

function createdTables(sql: string): string[] {
  return Array.from(
    sql.matchAll(/create table if not exists public\.([a-z_]+)/g),
    (match) => match[1],
  );
}

const catalogTables = createdTables(catalog);
const operationsTables = createdTables(operations);
const commerceTables = createdTables(commerce);
const allTables = [...catalogTables, ...operationsTables, ...commerceTables];

/** Tables that are scoped to a branch and must carry a branch composite FK. */
const BRANCH_SCOPED_TABLES = [
  "class_templates",
  "memberships",
  "attendance_records",
  "pt_sessions",
  "class_sessions",
  "invoices",
  "payments",
  "credit_notes",
  "refunds",
  "pos_sales",
  "stock_movements",
  "purchases",
  "expenses",
  "income_entries",
  "trial_memberships",
];

describe("Phase 3.2 migration - structure", () => {
  it("creates the catalog, operations and commerce tables", () => {
    expect(catalogTables).toEqual(
      expect.arrayContaining([
        "trainers",
        "membership_plans",
        "gst_rates",
        "exercises",
        "class_templates",
        "products",
        "suppliers",
      ]),
    );
    expect(operationsTables).toEqual(
      expect.arrayContaining([
        "memberships",
        "membership_freezes",
        "attendance_records",
        "trainer_assignments",
        "pt_sessions",
        "class_sessions",
        "class_bookings",
        "workout_plans",
        "workout_plan_items",
        "diet_plans",
        "diet_plan_items",
        "body_measurements",
        "progress_entries",
      ]),
    );
    expect(commerceTables).toEqual(
      expect.arrayContaining([
        "invoices",
        "invoice_items",
        "payments",
        "installments",
        "credit_notes",
        "refunds",
        "pos_sales",
        "pos_sale_items",
        "stock_movements",
        "purchases",
        "purchase_items",
        "expenses",
        "income_entries",
        "leads",
        "trial_memberships",
        "follow_ups",
        "referrals",
        "notifications",
      ]),
    );
  });

  it("uses only additive DDL and never drops tables, columns or helpers", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/drop table/i);
      expect(sql).not.toMatch(/drop column/i);
      expect(sql).not.toMatch(/drop function/i);
    }
  });

  it("gives every org-owned table an organization_id and a composite branch FK where scoped", () => {
    for (const table of allTables) {
      const sql = migrations.find((source) => source.includes(`public.${table}`))!;
      if (table === "notifications") continue;
      expect(sql).toMatch(new RegExp(`create table if not exists public\\.${table} \\([\\s\\S]*?organization_id`));
    }

    for (const table of BRANCH_SCOPED_TABLES) {
      const sql = migrations.find((source) => source.includes(`public.${table}`))!;
      expect(sql).toMatch(
        new RegExp(
          `alter table public\\.${table} add constraint ${table}_branch_org_fkey[\\s\\S]*?foreign key \\(organization_id, branch_id\\) references public\\.branches\\(organization_id, id\\)`,
        ),
      );
    }
  });

  it("attaches the real trainers relationship reserved by Phase 3.1", () => {
    expect(catalog).toMatch(
      /alter table public\.gym_members add constraint gym_members_assigned_trainer_fkey[\s\S]*?foreign key \(assigned_trainer_id\) references public\.trainers\(id\) on delete set null/,
    );
    expect(catalog).toMatch(/create table if not exists public\.trainers/);
  });
});

describe("Phase 3.2 migration - security model", () => {
  it("enables row level security on every table", () => {
    for (const table of allTables) {
      const sql = migrations.find((source) => source.includes(`public.${table}`))!;
      expect(sql).toMatch(new RegExp(`alter table public\\.${table} enable row level security`));
    }
  });

  it("exposes only select policies and no direct write policies", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/for (insert|update|delete)\b/i);
    }
  });

  it("never uses a blanket USING (true) policy", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/using\s*\(\s*true\s*\)/i);
    }
  });

  it("scopes branch-based reads through user_has_branch_access", () => {
    for (const table of BRANCH_SCOPED_TABLES) {
      const sql = migrations.find((source) => source.includes(`public.${table}`))!;
      expect(sql).toMatch(
        new RegExp(
          `on public\\.${table} for select[\\s\\S]*?public\\.is_org_member\\(organization_id\\)[\\s\\S]*?public\\.user_has_branch_access\\(organization_id, branch_id\\)`,
        ),
      );
    }
  });

  it("keeps notifications strictly recipient-scoped", () => {
    expect(commerce).toMatch(
      /create policy "users can view their own notifications"[\s\S]*?using \(recipient_id = auth\.uid\(\)\)/,
    );
    expect(commerce).toMatch(
      /recipient_id uuid not null references auth\.users\(id\) on delete cascade/,
    );
  });

  it("does not hard-delete module data from any statement", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/delete from public\./i);
    }
  });

  it("does not model a member freeze as a member status", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/'frozen'/);
    }
  });
});

describe("Phase 3.2 migration - audit trail", () => {
  it("audits trainer, plan, product and supplier changes via the shared trigger", () => {
    for (const name of ["trainers", "membership_plans", "products", "suppliers"]) {
      expect(catalog).toMatch(new RegExp(`create trigger audit_${name}[\\s\\S]*?public\\.${name}`));
    }
  });

  it("audits membership, attendance, booking and assignment changes", () => {
    for (const name of [
      "memberships",
      "attendance_records",
      "class_bookings",
      "trainer_assignments",
    ]) {
      expect(operations).toMatch(
        new RegExp(`create trigger audit_${name}[\\s\\S]*?on public\\.${name}`),
      );
    }
  });

  it("audits commerce and CRM changes via the dedicated commerce trigger", () => {
    expect(commerce).toMatch(/create or replace function public\.audit_commerce_trigger\(\)/);
    expect(commerce).toMatch(/create trigger audit_commerce after insert or update/);
    for (const name of [
      "invoices",
      "payments",
      "credit_notes",
      "refunds",
      "pos_sales",
      "purchases",
      "expenses",
      "income_entries",
      "leads",
      "trial_memberships",
      "follow_ups",
      "referrals",
    ]) {
      expect(commerce).toMatch(new RegExp(`'public\\.${name}'`));
    }
  });

  it("never logs secrets or tokens in the audit metadata", () => {
    for (const sql of migrations) {
      expect(sql).not.toMatch(/token_hash|access_token|refresh_token|password/);
    }
  });
});
