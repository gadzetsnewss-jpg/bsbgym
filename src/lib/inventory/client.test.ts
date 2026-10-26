/**
 * Static invariants for the Phase 7 inventory client.
 *
 * Verifies the client talks to the right tables/RPCs, scopes every read to the
 * organization and routes all writes through SECURITY DEFINER RPCs (never
 * direct table inserts/updates).
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const client = readFileSync(
  join(process.cwd(), "src", "lib", "inventory", "client.ts"),
  "utf8",
);

describe("inventory client reads", () => {
  it("reads the frozen Phase 7 tables", () => {
    for (const table of ["purchases", "purchase_items", "pos_sales", "pos_sale_items", "stock_movements", "products", "suppliers"]) {
      expect(client).toMatch(new RegExp(`\\.from\\("${table}"`));
    }
  });

  it("scopes list queries to organization_id", () => {
    expect(client).toMatch(/\.eq\("organization_id", filters\.organizationId\)/);
    expect(client).toMatch(/\.eq\("organization_id", organizationId\)/);
  });

  it("disambiguates the member embed for POS sales", () => {
    expect(client).toMatch(/gym_members\(id, full_name, first_name, last_name, code\)/);
  });

  it("loads only active products and suppliers for pickers", () => {
    expect(client).toMatch(/\.eq\("is_active" as "id", true as unknown as string\)/);
  });
});

describe("inventory client writes", () => {
  it("routes every write through the Phase 7 RPCs", () => {
    for (const fn of [
      "create_purchase",
      "update_purchase",
      "receive_purchase",
      "cancel_purchase",
      "create_pos_sale",
      "void_pos_sale",
    ]) {
      expect(client).toMatch(new RegExp(`\\("${fn}",`));
    }
  });

  it("never writes to module tables directly", () => {
    expect(client).not.toMatch(/\.insert\(/);
    expect(client).not.toMatch(/\.update\(/);
    expect(client).not.toMatch(/\.delete\(/);
  });

  it("passes organization_id to create RPCs but not to row-scoped RPCs", () => {
    expect(client).toMatch(/p_org_id: input\.organizationId/);
    expect(client).toMatch(/rpcVoid\("receive_purchase", \{ p_purchase_id: purchaseId \}\)/);
    expect(client).toMatch(/rpcVoid\("void_pos_sale", \{ p_sale_id: saleId \}\)/);
  });

  it("rounds money before sending it to the server", () => {
    expect(client).toMatch(/roundMoney\(item\.unitCost\)/);
    expect(client).toMatch(/roundMoney\(input\.discount \?\? 0\)/);
  });
});
