/**
 * Static migration invariant tests for Phase 9 notification read RPCs.
 *
 * No live database in this environment, so these tests validate the migration
 * source: SECURITY DEFINER writes, recipient-scoped updates, reuse of the
 * existing notifications table, and the absence of new columns or jobs.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261020000032_notification_read_rpcs.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const PUBLIC_FNS = ["mark_notification_read", "mark_all_notifications_read"] as const;

describe("Phase 9 notification read RPC migration", () => {
  it("defines every public RPC as SECURITY DEFINER and grants execute to authenticated", () => {
    for (const fn of PUBLIC_FNS) {
      const body = functionBody(fn);
      expect(body).toMatch(/security definer/);
      expect(body).toMatch(/set search_path = public/);
      expect(migration).toMatch(
        new RegExp(`grant execute on function public\\.${fn}[\\s\\S]*?to authenticated`),
      );
    }
  });

  it("updates only the caller's own notification rows", () => {
    expect(functionBody("mark_notification_read")).toMatch(/recipient_id = auth\.uid\(\)/);
    expect(functionBody("mark_all_notifications_read")).toMatch(/recipient_id = auth\.uid\(\)/);
    expect(functionBody("mark_all_notifications_read")).toMatch(/is_org_member\(p_org_id\)/);
  });

  it("only sets is_read and never inserts or deletes notifications", () => {
    expect(migration).toMatch(/set is_read = true/);
    expect(migration).not.toMatch(/insert into public\.notifications/i);
    expect(migration).not.toMatch(/delete from public\.notifications/i);
    expect(migration).not.toMatch(/create table/i);
    expect(migration).not.toMatch(/alter table/i);
    expect(migration).not.toMatch(/pg_cron/i);
  });

  it("never writes finance, memberships, billing or CRM tables", () => {
    const sql = migration.replace(/--.*$/gm, "");
    expect(sql).not.toMatch(/\b(invoices|payments|memberships|expenses|income_entries|pos_sales)\b/i);
    expect(sql).toMatch(/update public\.notifications/);
  });
});
