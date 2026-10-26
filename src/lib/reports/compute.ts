/**
 * Pure Phase 9 aggregations. Collected cash never includes invoice totals.
 * Outstanding is invoice remainder. Freeze windows are not a membership status.
 */

import { remainingDaysFromToday } from "@/lib/operations/freeze";
import { roundMoney } from "@/lib/billing/gst";
import type { FinanceDashboard } from "@/lib/finance/types";
import type { CrmPipelineCounts } from "@/lib/crm/client";
import type {
  AttendanceReportRow,
  MemberReportRow,
  MembershipReportRow,
  ReportsOverview,
  StockReportRow,
} from "@/lib/reports/types";

export const OPEN_INVOICE_STATUSES = ["issued", "partially_paid", "overdue"] as const;
export const ACTIVE_INVOICE_STATUSES = ["issued", "partially_paid", "overdue", "paid"] as const;
export const MEMBERSHIP_STATUSES = ["pending", "active", "expired", "cancelled"] as const;

export function countByStatus(rows: { status: string }[], status: string): number {
  return rows.filter((row) => row.status === status).length;
}

export function membersJoinedInRange(
  rows: MemberReportRow[],
  from?: string,
  to?: string,
): MemberReportRow[] {
  return rows.filter((row) => {
    const day = row.joinedAt.slice(0, 10);
    if (from && day < from) return false;
    if (to && day > to) return false;
    return true;
  });
}

export function expiringMemberships(
  rows: MembershipReportRow[],
  today = new Date().toISOString().slice(0, 10),
  days = 30,
): MembershipReportRow[] {
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + days);
  const until = limit.toISOString().slice(0, 10);
  return rows.filter((row) => {
    if (row.status !== "active") return false;
    const end = row.endDate.slice(0, 10);
    return end >= today && end <= until;
  });
}

export function daysUntilExpiry(endDate: string, today = new Date().toISOString().slice(0, 10)): number {
  return remainingDaysFromToday(endDate, today);
}

export function lowStockRows(rows: StockReportRow[]): StockReportRow[] {
  return rows.filter((row) => row.isLow);
}

export function stockValueTotal(rows: StockReportRow[]): number {
  return roundMoney(rows.reduce((sum, row) => sum + row.stockValue, 0));
}

export function attendanceInRange(rows: AttendanceReportRow[]): number {
  return rows.length;
}

export function buildReportsOverview(input: {
  members: MemberReportRow[];
  memberships: MembershipReportRow[];
  freezeWindowsOpen: number;
  finance: FinanceDashboard;
  crm: CrmPipelineCounts;
  attendanceInRange: number;
  stock: StockReportRow[];
  from?: string;
  to?: string;
}): ReportsOverview {
  const joined = membersJoinedInRange(input.members, input.from, input.to);
  const expiring = expiringMemberships(input.memberships);
  const low = lowStockRows(input.stock);
  return {
    activeMembers: countByStatus(input.members, "active"),
    inactiveMembers: countByStatus(input.members, "inactive"),
    suspendedMembers: countByStatus(input.members, "suspended"),
    membersJoinedInRange: joined.length,
    activeMemberships: countByStatus(input.memberships, "active"),
    pendingMemberships: countByStatus(input.memberships, "pending"),
    expiredMemberships: countByStatus(input.memberships, "expired"),
    cancelledMemberships: countByStatus(input.memberships, "cancelled"),
    expiringMemberships: expiring.length,
    freezeWindowsOpen: input.freezeWindowsOpen,
    invoicedTotal: input.finance.invoicedTotal,
    paymentsCollected: input.finance.paymentsCollected,
    outstanding: input.finance.outstanding,
    posSalesTotal: input.finance.posSalesTotal,
    otherIncomeTotal: input.finance.otherIncomeTotal,
    collectedTotal: input.finance.collectedTotal,
    expensesPaid: input.finance.expensesPaid,
    attendanceInRange: input.attendanceInRange,
    newLeads: input.crm.newLeads,
    followUpsOverdue: input.crm.followUpsOverdue,
    lowStockCount: low.length,
    stockValue: stockValueTotal(input.stock),
  };
}
