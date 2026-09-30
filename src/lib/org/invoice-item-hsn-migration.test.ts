/**
 * Static migration invariant tests for invoice line HSN / SAC.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260928000021_invoice_item_hsn.sql"),
  "utf8",
);

describe("invoice item HSN migration", () => {
  it("adds hsn_sac without dropping invoice_items", () => {
    expect(migration).toMatch(/alter table public\.invoice_items add column if not exists hsn_sac text/);
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/delete from public\./i);
  });

  it("persists hsn_sac from create_invoice item JSON", () => {
    expect(migration).toMatch(/create or replace function public\.create_invoice\(/);
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/v_hsn := nullif\(trim\(v_item ->> 'hsn_sac'\), ''\)/);
    expect(migration).toMatch(/hsn_sac/);
    expect(migration).toMatch(
      /grant execute on function public\.create_invoice\([\s\S]*?to authenticated/,
    );
  });
});
