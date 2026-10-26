/**
 * Phase 9 report shapes. Metrics reuse existing tables and finance math.
 * Collected cash is never invoice totals. Purchases are stock cost, not expenses.
 */

export const REPORT_CATEGORIES = [
  "members",
  "memberships",
  "billing",
  "attendance",
  "crm",
  "inventory",
  "pos",
] as const;

export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export interface ReportScope {
  organizationId: string;
  branchId?: string;
  from?: string;
  to?: string;
}

export interface ReportCategoryMeta {
  id: ReportCategory;
  title: string;
  description: string;
  href: string;
  permission: string;
  moduleHref: string;
}

export const REPORT_CATEGORY_META: readonly ReportCategoryMeta[] = [
  {
    id: "members",
    title: "Members",
    description: "Profiles by status and joins in the selected range.",
    href: "/reports/members",
    permission: "members.view",
    moduleHref: "/members",
  },
  {
    id: "memberships",
    title: "Memberships",
    description: "Active, expiring, expired and freeze windows. Freeze is not a member status.",
    href: "/reports/memberships",
    permission: "memberships.view",
    moduleHref: "/memberships/active",
  },
  {
    id: "billing",
    title: "Billing & collections",
    description: "Invoiced totals, invoice payments and outstanding balances. Cash movement lives under Finance.",
    href: "/reports/billing",
    permission: "billing.view",
    moduleHref: "/billing",
  },
  {
    id: "attendance",
    title: "Attendance",
    description: "Check-ins in the selected range.",
    href: "/reports/attendance",
    permission: "attendance.view",
    moduleHref: "/attendance",
  },
  {
    id: "crm",
    title: "CRM",
    description: "Lead pipeline, follow-ups and trials.",
    href: "/reports/crm",
    permission: "crm.view",
    moduleHref: "/crm",
  },
  {
    id: "inventory",
    title: "Inventory",
    description: "Stock on hand and products at or below reorder level.",
    href: "/reports/inventory",
    permission: "inventory.view",
    moduleHref: "/inventory/stock",
  },
  {
    id: "pos",
    title: "POS sales",
    description: "Completed point-of-sale totals. Not mixed into invoice payments.",
    href: "/reports/pos",
    permission: "pos.view",
    moduleHref: "/pos/sales",
  },
];

export interface MemberReportRow {
  id: string;
  code: string;
  fullName: string;
  status: string;
  branchName: string;
  joinedAt: string;
  phone: string;
}

export interface MembershipReportRow {
  id: string;
  memberId: string;
  memberName: string;
  planName: string;
  status: string;
  branchName: string;
  startDate: string;
  endDate: string;
  freezeDaysUsed: number;
}

export interface AttendanceReportRow {
  id: string;
  memberName: string;
  branchName: string;
  checkInAt: string;
  checkOutAt: string | null;
  method: string;
}

export interface PosReportRow {
  id: string;
  saleNumber: string;
  branchName: string;
  status: string;
  total: number;
  paymentMethod: string;
  soldAt: string;
}

export interface StockReportRow {
  productId: string;
  name: string;
  sku: string | null;
  unit: string;
  stockQuantity: number;
  reorderLevel: number;
  stockValue: number;
  isLow: boolean;
}

export interface ReportsOverview {
  activeMembers: number;
  inactiveMembers: number;
  suspendedMembers: number;
  membersJoinedInRange: number;
  activeMemberships: number;
  pendingMemberships: number;
  expiredMemberships: number;
  cancelledMemberships: number;
  expiringMemberships: number;
  freezeWindowsOpen: number;
  invoicedTotal: number;
  paymentsCollected: number;
  outstanding: number;
  posSalesTotal: number;
  otherIncomeTotal: number;
  collectedTotal: number;
  expensesPaid: number;
  attendanceInRange: number;
  newLeads: number;
  followUpsOverdue: number;
  lowStockCount: number;
  stockValue: number;
}

export interface CsvColumn<T> {
  header: string;
  value: (row: T) => string | number;
}
