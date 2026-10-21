import { describe, expect, it } from "vitest";
import {
  buildReportsOverview,
  countByStatus,
  expiringMemberships,
  lowStockRows,
  membersJoinedInRange,
  stockValueTotal,
} from "@/lib/reports/compute";
import { buildCsv, toCsvCell } from "@/lib/reports/csv";
import type { FinanceDashboard } from "@/lib/finance/types";
import type { CrmPipelineCounts } from "@/lib/crm/client";
import type { MemberReportRow, MembershipReportRow, StockReportRow } from "@/lib/reports/types";

const finance: FinanceDashboard = {
  scope: { from: "2026-10-01", to: "2026-10-21", branchId: null },
  expensesTotal: 80,
  expensesPaid: 80,
  expensesPending: 0,
  expenseCount: 1,
  otherIncomeTotal: 50,
  incomeCount: 1,
  invoicedTotal: 1000,
  invoiceCount: 2,
  outstanding: 600,
  paymentsCollected: 400,
  paymentCount: 2,
  posSalesTotal: 150,
  posSaleCount: 1,
  purchaseTotal: 200,
  purchaseCount: 1,
  refundsProcessed: 0,
  refundCount: 0,
  collectedTotal: 600,
  netCash: 520,
  recentExpenses: [],
  recentIncome: [],
  recentPayments: [],
};

const crm: CrmPipelineCounts = {
  newLeads: 3,
  contacted: 1,
  qualified: 1,
  trial: 1,
  converted: 2,
  lost: 0,
  followUpsToday: 0,
  followUpsOverdue: 1,
  trialsUpcoming: 0,
  trialsActive: 1,
  referralsPending: 0,
};

function member(overrides: Partial<MemberReportRow>): MemberReportRow {
  return {
    id: "m1",
    code: "MB-1",
    fullName: "Ada",
    status: "active",
    joinedAt: "2026-10-01",
    branchName: "Main",
    phone: "9999999999",
    ...overrides,
  };
}

function membership(overrides: Partial<MembershipReportRow>): MembershipReportRow {
  return {
    id: "ms1",
    memberId: "m1",
    memberName: "Ada",
    planName: "Quarterly",
    status: "active",
    startDate: "2026-09-01",
    endDate: "2026-10-25",
    branchName: "Main",
    freezeDaysUsed: 0,
    ...overrides,
  };
}

describe("report aggregations", () => {
  it("counts members by status without inventing frozen", () => {
    const rows = [
      member({ id: "1", status: "active" }),
      member({ id: "2", status: "inactive" }),
      member({ id: "3", status: "suspended" }),
    ];
    expect(countByStatus(rows, "active")).toBe(1);
    expect(countByStatus(rows, "frozen")).toBe(0);
  });

  it("filters members joined in range inclusively", () => {
    const rows = [
      member({ id: "1", joinedAt: "2026-09-30" }),
      member({ id: "2", joinedAt: "2026-10-01" }),
      member({ id: "3", joinedAt: "2026-10-15" }),
    ];
    expect(membersJoinedInRange(rows, "2026-10-01", "2026-10-15")).toHaveLength(2);
  });

  it("expiring memberships require active status and an end date in the window", () => {
    const rows = [
      membership({ id: "1", status: "active", endDate: "2026-10-21" }),
      membership({ id: "2", status: "expired", endDate: "2026-10-21" }),
      membership({ id: "3", status: "active", endDate: "2026-12-01" }),
    ];
    expect(expiringMemberships(rows, "2026-10-21", 30).map((row) => row.id)).toEqual(["1"]);
  });

  it("low stock and stock value use existing inventory rows", () => {
    const stock: StockReportRow[] = [
      { productId: "p1", name: "Whey", sku: "W1", unit: "pcs", stockQuantity: 2, reorderLevel: 5, stockValue: 40, isLow: true },
      { productId: "p2", name: "Bar", sku: "B1", unit: "pcs", stockQuantity: 20, reorderLevel: 5, stockValue: 100, isLow: false },
    ];
    expect(lowStockRows(stock)).toHaveLength(1);
    expect(stockValueTotal(stock)).toBe(140);
  });

  it("overview collected cash comes from finance and is not invoice totals", () => {
    const overview = buildReportsOverview({
      members: [member({ status: "active" })],
      memberships: [membership({ status: "active" })],
      freezeWindowsOpen: 2,
      finance,
      crm,
      attendanceInRange: 9,
      stock: [],
      from: "2026-10-01",
      to: "2026-10-21",
    });
    expect(overview.collectedTotal).toBe(600);
    expect(overview.invoicedTotal).toBe(1000);
    expect(overview.collectedTotal).not.toBe(overview.invoicedTotal);
    expect(overview.outstanding).toBe(600);
    expect(overview.freezeWindowsOpen).toBe(2);
    expect(overview.paymentsCollected + overview.posSalesTotal + overview.otherIncomeTotal).toBe(
      overview.collectedTotal,
    );
  });
});

describe("csv helper", () => {
  it("quotes commas and doubled quotes", () => {
    expect(toCsvCell('Ada, "Ada"')).toBe('"Ada, ""Ada"""');
    expect(buildCsv(["Name", "Amount"], [["Ada", 12]])).toBe("Name,Amount\nAda,12\n");
  });
});
