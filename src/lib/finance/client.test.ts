/**
 * Static invariants for the Phase 8 finance client.
 *
 * Verifies the client talks to the right tables/RPCs, scopes every read to the
 * organization and routes all writes through SECURITY DEFINER RPCs (never
 * direct table inserts/updates). Dashboard math must not double-count sources.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { computeFinanceDashboard } from "@/lib/finance/client";
import { buildTransactions, type FinanceSnapshot } from "@/lib/finance/types";

const client = readFileSync(join(process.cwd(), "src", "lib", "finance", "client.ts"), "utf8");

describe("finance client reads", () => {
  it("reads the existing finance and commerce tables", () => {
    for (const table of ["expenses", "income_entries", "pos_sales", "purchases", "refunds"]) {
      expect(client).toMatch(new RegExp(`\\.from\\("${table}"`));
    }
  });

  it("scopes list queries to organization_id", () => {
    expect(client).toMatch(/\.eq\("organization_id", filters\.organizationId\)/);
    expect(client).toMatch(/\.eq\("organization_id", organizationId\)/);
    expect(client).toMatch(/\.eq\("organization_id", scope\.organizationId\)/);
  });

  it("loads purchases only when received and refunds only when processed", () => {
    expect(client).toMatch(/\.eq\("status" as "id", "received"\)/);
    expect(client).toMatch(/\.eq\("status" as "id", "processed"\)/);
  });

  it("pages POS, purchase and refund snapshot reads instead of a 5000-row cap", () => {
    expect(client).toMatch(/const SNAPSHOT_PAGE_SIZE = 200/);
    expect(client).toMatch(/const SNAPSHOT_MAX_PAGES = 50/);
    expect(client).not.toMatch(/\.limit\(5000\)/);
    expect(client).toMatch(/\.range\(from, to\)/);
  });
});

describe("finance client writes", () => {
  it("routes every write through the Phase 8 RPCs", () => {
    for (const fn of [
      "create_expense",
      "update_expense",
      "create_income_entry",
      "update_income_entry",
    ]) {
      expect(client).toMatch(new RegExp(`"${fn}"`));
    }
  });

  it("never writes to module tables directly", () => {
    expect(client).not.toMatch(/\.insert\(/);
    expect(client).not.toMatch(/\.update\(/);
    expect(client).not.toMatch(/\.delete\(/);
  });

  it("rounds money before sending it to the server", () => {
    expect(client).toMatch(/roundMoney\(input\.amount\)/);
  });
});

function emptySnapshot(overrides: Partial<FinanceSnapshot> = {}): FinanceSnapshot {
  return {
    expenses: [],
    income: [],
    invoices: [],
    payments: [],
    posSales: [],
    purchases: [],
    refunds: [],
    ...overrides,
  };
}

describe("finance dashboard calculations", () => {
  it("does not add invoice totals, payments and POS into one revenue figure", () => {
    const dashboard = computeFinanceDashboard(
      { organizationId: "org" },
      emptySnapshot({
        invoices: [
          {
            id: "inv-1",
            branchId: "b1",
            invoiceNumber: "INV-1",
            memberName: "A",
            status: "issued",
            issueDate: "2026-10-01",
            dueDate: "2026-10-10",
            total: 1000,
            amountPaid: 400,
            amountCredited: 0,
            balance: 600,
          },
        ],
        payments: [
          {
            id: "pay-1",
            branchId: "b1",
            branchName: "Main",
            invoiceId: "inv-1",
            invoiceNumber: "INV-1",
            memberName: "A",
            amount: 400,
            method: "cash",
            paidAt: "2026-10-02",
          },
        ],
        posSales: [
          {
            id: "sale-1",
            branchId: "b1",
            branchName: "Main",
            saleNumber: "POS-1",
            status: "completed",
            total: 250,
            paymentMethod: "upi",
            soldAt: "2026-10-03",
          },
        ],
        income: [
          {
            id: "inc-1",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Locker rental",
            description: null,
            amount: 50,
            incomeDate: "2026-10-04",
            paymentMethod: "cash",
            reference: null,
            createdAt: "2026-10-04",
          },
        ],
      }),
    );
    expect(dashboard.invoicedTotal).toBe(1000);
    expect(dashboard.paymentsCollected).toBe(400);
    expect(dashboard.outstanding).toBe(600);
    expect(dashboard.posSalesTotal).toBe(250);
    expect(dashboard.otherIncomeTotal).toBe(50);
    expect(dashboard.collectedTotal).toBe(700);
    expect(dashboard.collectedTotal).not.toBe(dashboard.invoicedTotal + dashboard.paymentsCollected);
  });

  it("excludes pending expenses, void POS sales, unpaid invoices and unprocessed refunds from cash", () => {
    const dashboard = computeFinanceDashboard(
      { organizationId: "org" },
      emptySnapshot({
        expenses: [
          {
            id: "e1",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Rent",
            description: null,
            amount: 100,
            expenseDate: "2026-10-01",
            paymentMethod: "cash",
            status: "paid",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
          {
            id: "e2",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Salaries",
            description: null,
            amount: 500,
            expenseDate: "2026-10-01",
            paymentMethod: "bank_transfer",
            status: "pending",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
        ],
        posSales: [
          {
            id: "sale-void",
            branchId: "b1",
            branchName: "Main",
            saleNumber: "POS-2",
            status: "void",
            total: 999,
            paymentMethod: "cash",
            soldAt: "2026-10-03",
          },
        ],
        invoices: [
          {
            id: "inv-draft",
            branchId: "b1",
            invoiceNumber: "INV-D",
            memberName: null,
            status: "draft",
            issueDate: "2026-10-01",
            dueDate: null,
            total: 800,
            amountPaid: 0,
            amountCredited: 0,
            balance: 800,
          },
        ],
        refunds: [
          {
            id: "r1",
            branchId: "b1",
            invoiceId: "inv-1",
            amount: 40,
            status: "requested",
            processedAt: null,
          },
          {
            id: "r2",
            branchId: "b1",
            invoiceId: "inv-1",
            amount: 25,
            status: "processed",
            processedAt: "2026-10-05",
          },
        ],
        payments: [
          {
            id: "pay-1",
            branchId: "b1",
            branchName: "Main",
            invoiceId: "inv-1",
            invoiceNumber: "INV-1",
            memberName: "A",
            amount: 200,
            method: "cash",
            paidAt: "2026-10-02",
          },
        ],
      }),
    );
    expect(dashboard.expensesPaid).toBe(100);
    expect(dashboard.expensesPending).toBe(500);
    expect(dashboard.posSalesTotal).toBe(0);
    expect(dashboard.invoicedTotal).toBe(0);
    expect(dashboard.refundsProcessed).toBe(25);
    expect(dashboard.collectedTotal).toBe(200);
    expect(dashboard.netCash).toBe(75);
  });

  it("does not treat received purchases as expenses", () => {
    const dashboard = computeFinanceDashboard(
      { organizationId: "org" },
      emptySnapshot({
        expenses: [
          {
            id: "e1",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Rent",
            description: null,
            amount: 10,
            expenseDate: "2026-10-01",
            paymentMethod: "cash",
            status: "paid",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
        ],
        purchases: [
          {
            id: "p1",
            branchId: "b1",
            branchName: "Main",
            purchaseNumber: "PO-1",
            supplierName: "Acme",
            status: "received",
            orderDate: "2026-10-01",
            receivedDate: "2026-10-02",
            total: 300,
          },
          {
            id: "p2",
            branchId: "b1",
            branchName: "Main",
            purchaseNumber: "PO-2",
            supplierName: "Acme",
            status: "draft",
            orderDate: "2026-10-01",
            receivedDate: null,
            total: 90,
          },
        ],
      }),
    );
    expect(dashboard.purchaseTotal).toBe(300);
    expect(dashboard.purchaseCount).toBe(1);
    expect(dashboard.expensesPaid).toBe(10);
    expect(dashboard.expensesPaid).not.toBe(310);
  });
});

describe("Phase 8 acceptance-scenario guards", () => {
  it("C: invoiced, collected, POS and purchase costs stay as separate figures", () => {
    const dashboard = computeFinanceDashboard(
      { organizationId: "org" },
      emptySnapshot({
        invoices: [
          {
            id: "inv-1",
            branchId: "b1",
            invoiceNumber: "INV-1",
            memberName: "A",
            status: "issued",
            issueDate: "2026-10-01",
            dueDate: "2026-10-10",
            total: 1000,
            amountPaid: 400,
            amountCredited: 0,
            balance: 600,
          },
        ],
        payments: [
          {
            id: "pay-1",
            branchId: "b1",
            branchName: "Main",
            invoiceId: "inv-1",
            invoiceNumber: "INV-1",
            memberName: "A",
            amount: 400,
            method: "cash",
            paidAt: "2026-10-02",
          },
        ],
        posSales: [
          {
            id: "sale-1",
            branchId: "b1",
            branchName: "Main",
            saleNumber: "POS-1",
            status: "completed",
            total: 250,
            paymentMethod: "upi",
            soldAt: "2026-10-03",
          },
        ],
        purchases: [
          {
            id: "p1",
            branchId: "b1",
            branchName: "Main",
            purchaseNumber: "PO-1",
            supplierName: "Acme",
            status: "received",
            orderDate: "2026-10-01",
            receivedDate: "2026-10-02",
            total: 300,
          },
        ],
      }),
    );
    expect(dashboard.invoicedTotal).toBe(1000);
    expect(dashboard.paymentsCollected).toBe(400);
    expect(dashboard.posSalesTotal).toBe(250);
    expect(dashboard.purchaseTotal).toBe(300);
    expect(dashboard.collectedTotal).toBe(650);
    expect(dashboard.collectedTotal).not.toBe(
      dashboard.invoicedTotal + dashboard.paymentsCollected + dashboard.posSalesTotal,
    );
  });

  it("D/I: outstanding is excluded from cash and net cash is not labelled profit", () => {
    const dashboard = computeFinanceDashboard(
      { organizationId: "org" },
      emptySnapshot({
        invoices: [
          {
            id: "inv-1",
            branchId: "b1",
            invoiceNumber: "INV-1",
            memberName: "A",
            status: "issued",
            issueDate: "2026-10-01",
            dueDate: "2026-10-10",
            total: 1000,
            amountPaid: 200,
            amountCredited: 0,
            balance: 800,
          },
        ],
        payments: [
          {
            id: "pay-1",
            branchId: "b1",
            branchName: "Main",
            invoiceId: "inv-1",
            invoiceNumber: "INV-1",
            memberName: "A",
            amount: 200,
            method: "cash",
            paidAt: "2026-10-02",
          },
        ],
        expenses: [
          {
            id: "e1",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Rent",
            description: null,
            amount: 50,
            expenseDate: "2026-10-01",
            paymentMethod: "cash",
            status: "paid",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
        ],
      }),
    );
    expect(dashboard.outstanding).toBe(800);
    expect(dashboard.collectedTotal).toBe(200);
    expect(dashboard.collectedTotal).not.toBe(dashboard.invoicedTotal);
    expect(dashboard.netCash).toBe(150);
    expect(client).toMatch(/Cash movement is not profit|never adds invoice totals/);
  });
});

describe("finance transactions", () => {
  it("links each row back to its source and skips non-cash records", () => {
    const rows = buildTransactions(
      emptySnapshot({
        expenses: [
          {
            id: "e-paid",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Rent",
            description: null,
            amount: 10,
            expenseDate: "2026-10-01",
            paymentMethod: "cash",
            status: "paid",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
          {
            id: "e-pending",
            organizationId: "org",
            branchId: "b1",
            branchName: "Main",
            category: "Salaries",
            description: null,
            amount: 99,
            expenseDate: "2026-10-01",
            paymentMethod: "cash",
            status: "pending",
            reference: null,
            createdAt: "2026-10-01",
            updatedAt: "2026-10-01",
          },
        ],
        posSales: [
          {
            id: "sale-1",
            branchId: "b1",
            branchName: "Main",
            saleNumber: "POS-1",
            status: "completed",
            total: 20,
            paymentMethod: "cash",
            soldAt: "2026-10-03",
          },
          {
            id: "sale-void",
            branchId: "b1",
            branchName: "Main",
            saleNumber: "POS-2",
            status: "void",
            total: 20,
            paymentMethod: "cash",
            soldAt: "2026-10-03",
          },
        ],
        purchases: [
          {
            id: "p1",
            branchId: "b1",
            branchName: "Main",
            purchaseNumber: "PO-1",
            supplierName: "Acme",
            status: "received",
            orderDate: "2026-10-01",
            receivedDate: "2026-10-02",
            total: 30,
          },
          {
            id: "p2",
            branchId: "b1",
            branchName: "Main",
            purchaseNumber: "PO-2",
            supplierName: "Acme",
            status: "draft",
            orderDate: "2026-10-01",
            receivedDate: null,
            total: 30,
          },
        ],
      }),
    );
    expect(rows.map((row) => row.key)).toEqual(["pos_sale:sale-1", "purchase:p1", "expense:e-paid"]);
    expect(rows.find((row) => row.source === "expense")?.href).toBe("/finance/expenses/e-paid");
    expect(rows.find((row) => row.source === "pos_sale")?.href).toBe("/pos/sales/sale-1");
    expect(rows.find((row) => row.source === "purchase")?.href).toBe("/inventory/purchases/p1");
  });
});
