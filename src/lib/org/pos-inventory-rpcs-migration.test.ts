/**
 * Static migration invariant tests for Phase 7 (POS + inventory + purchases).
 *
 * No live database in this environment, so these tests validate the migration
 * source: SECURITY DEFINER write RPCs, permission/branch re-checks, the
 * internal stock helper, stock-movement based inventory, and the absence of
 * hard deletes.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261013000030_pos_inventory_purchases.sql",
  ),
  "utf8",
);

function functionBody(name: string): string {
  const start = migration.indexOf(`create or replace function public.${name}(`);
  expect(start).toBeGreaterThan(-1);
  const next = migration.indexOf("create or replace function public.", start + 1);
  return migration.slice(start, next >= 0 ? next : undefined);
}

const PUBLIC_FNS = [
  "create_purchase",
  "update_purchase",
  "receive_purchase",
  "cancel_purchase",
  "create_pos_sale",
  "void_pos_sale",
] as const;

describe("Phase 7 inventory RPC migration - stock helper", () => {
  it("defines apply_stock_movement as SECURITY DEFINER and revokes it from clients", () => {
    const body = functionBody("apply_stock_movement");
    expect(body).toMatch(/security definer/);
    expect(body).toMatch(/set search_path = public/);
    expect(migration).toMatch(
      /revoke all on function public\.apply_stock_movement[\s\S]*?from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(/grant execute on function public\.apply_stock_movement/);
  });

  it("applies stock through stock_movements and updates products.stock_quantity", () => {
    const body = functionBody("apply_stock_movement");
    expect(body).toMatch(/insert into public\.stock_movements/);
    expect(body).toMatch(/update public\.products/);
    expect(body).toMatch(/stock_quantity/);
  });

  it("rejects unknown movement types and zero-quantity movements", () => {
    const body = functionBody("apply_stock_movement");
    expect(body).toMatch(/'purchase', 'sale', 'adjustment', 'return', 'consumption', 'transfer'/);
    expect(body).toMatch(/if p_quantity = 0 then/);
  });
});

describe("Phase 7 inventory RPC migration - write path", () => {
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

  it("create RPCs re-check permissions and branch membership", () => {
    expect(functionBody("create_purchase")).toMatch(
      /require_org_permission\(p_org_id, 'inventory\.manage'\)/,
    );
    expect(functionBody("create_purchase")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(functionBody("create_pos_sale")).toMatch(/require_org_permission\(p_org_id, 'pos\.create'\)/);
    expect(functionBody("create_pos_sale")).toMatch(/require_branch_in_org\(p_org_id, p_branch_id\)/);
  });

  it("row-scoped RPCs derive organization_id from the row and never take p_org_id", () => {
    for (const fn of ["update_purchase", "receive_purchase", "cancel_purchase", "void_pos_sale"]) {
      const body = functionBody(fn);
      expect(body).not.toMatch(/p_org_id/);
      expect(body).toMatch(/require_org_permission\(v_/);
      expect(body).toMatch(/require_branch_in_org\(v_/);
    }
  });
});

describe("Phase 7 inventory RPC migration - stock rules", () => {
  it("only receive_purchase increases stock for a purchase", () => {
    expect(functionBody("create_purchase")).not.toMatch(/apply_stock_movement/);
    expect(functionBody("update_purchase")).not.toMatch(/apply_stock_movement/);
    expect(functionBody("receive_purchase")).toMatch(/apply_stock_movement/);
  });

  it("receive_purchase is idempotent (guards on existing purchase movements)", () => {
    const body = functionBody("receive_purchase");
    expect(body).toMatch(/reference_type = 'purchase'/);
    expect(body).toMatch(/already received/);
  });

  it("create_pos_sale deducts stock once and void_pos_sale restores it", () => {
    expect(functionBody("create_pos_sale")).toMatch(/apply_stock_movement/);
    const voidBody = functionBody("void_pos_sale");
    expect(voidBody).toMatch(/reference_type = 'pos_sale_void'/);
    expect(voidBody).toMatch(/already void/);
  });

  it("never hard-deletes master or history rows and uses next_document_number for numbering", () => {
    expect(migration).not.toMatch(
      /delete from public\.(products|purchases|pos_sales|stock_movements|suppliers)\b/i,
    );
    expect(migration).toMatch(/next_document_number\(p_org_id, 'purchase', 'PO'\)/);
    expect(migration).toMatch(/next_document_number\(p_org_id, 'pos_sale', 'POS'\)/);
  });

  it("keeps update_product from overwriting stock_quantity", () => {
    const body = functionBody("update_product");
    expect(body).not.toMatch(/stock_quantity\s*=/);
  });
});

describe("Phase 7 acceptance-scenario guards", () => {
  it("B: a draft purchase never touches stock", () => {
    expect(functionBody("create_purchase")).toMatch(/'draft'/);
    expect(functionBody("create_purchase")).not.toMatch(/apply_stock_movement/);
  });

  it("C/D: receiving increases and pos sale deducts via the shared stock helper", () => {
    expect(functionBody("receive_purchase")).toMatch(/apply_stock_movement/);
    expect(functionBody("create_pos_sale")).toMatch(/apply_stock_movement/);
  });

  it("C: received purchases cannot be cancelled or re-received", () => {
    expect(functionBody("cancel_purchase")).toMatch(/received purchases cannot be cancelled/);
    expect(functionBody("receive_purchase")).toMatch(/purchase is already received/);
  });

  it("F: insufficient stock blocks a sale before any movement is written", () => {
    expect(functionBody("apply_stock_movement")).toMatch(/if v_next < 0 then/);
    expect(functionBody("apply_stock_movement")).toMatch(/insufficient stock/);
  });

  it("G: duplicate receiving and duplicate voiding are guarded", () => {
    expect(functionBody("receive_purchase")).toMatch(/reference_type = 'purchase'/);
    expect(functionBody("void_pos_sale")).toMatch(/reference_type = 'pos_sale_void'/);
    expect(functionBody("void_pos_sale")).toMatch(/sale is already void/);
  });

  it("edits are restricted to draft purchases", () => {
    expect(functionBody("update_purchase")).toMatch(/only draft purchases can be updated/);
  });
});
