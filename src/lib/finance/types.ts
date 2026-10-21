/**
 * Phase 8 finance domain types.
 *
 * Every type mirrors an existing table (expenses, income_entries, invoices,
 * payments, pos_sales, purchases, refunds). No new financial states are
 * introduced: statuses and directions below are presentation-only labels for
 * values the schema already stores.
 */

export const EXPENSE_STATUSES = ["pending", "paid"] as const;
export type ExpenseStatus = (typeof EXPENSE_STATUSES)[number];

export const EXPENSE_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  paid: "Paid",
};

export const EXPENSE_STATUS_TONES: Record<string, "warning" | "success"> = {
  pending: "warning",
  paid: "success",
};

export const FINANCE_SOURCES = [
  "expense",
  "income",
  "payment",
  "pos_sale",
  "purchase",
  "refund",
] as const;
export type FinanceSource = (typeof FINANCE_SOURCES)[number];

export const FINANCE_SOURCE_LABELS: Record<FinanceSource, string> = {
  expense: "Expense",
  income: "Other income",
  payment: "Invoice payment",
  pos_sale: "POS sale",
  purchase: "Purchase (stock received)",
  refund: "Refund",
};

export const FINANCE_SOURCE_TONES: Record<
  FinanceSource,
  "neutral" | "primary" | "success" | "warning" | "danger" | "info" | "accent"
> = {
  expense: "warning",
  income: "success",
  payment: "primary",
  pos_sale: "info",
  purchase: "neutral",
  refund: "danger",
};

export interface ExpenseRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  category: string;
  description: string | null;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  status: string;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface IncomeEntryRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  category: string;
  description: string | null;
  amount: number;
  incomeDate: string;
  paymentMethod: string;
  reference: string | null;
  createdAt: string;
}

export interface FinancePaymentRow {
  id: string;
  branchId: string;
  branchName: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  memberName: string | null;
  amount: number;
  method: string;
  paidAt: string;
}

export interface FinanceInvoiceRow {
  id: string;
  branchId: string;
  invoiceNumber: string;
  memberName: string | null;
  status: string;
  issueDate: string;
  dueDate: string | null;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
}

export interface FinancePosSaleRow {
  id: string;
  branchId: string;
  branchName: string;
  saleNumber: string;
  status: string;
  total: number;
  paymentMethod: string;
  soldAt: string;
}

export interface FinancePurchaseRow {
  id: string;
  branchId: string;
  branchName: string;
  purchaseNumber: string;
  supplierName: string | null;
  status: string;
  orderDate: string;
  receivedDate: string | null;
  total: number;
}

export interface FinanceRefundRow {
  id: string;
  branchId: string;
  invoiceId: string | null;
  amount: number;
  status: string;
  processedAt: string | null;
}

export interface FinanceScope {
  organizationId: string;
  branchId?: string;
  from?: string;
  to?: string;
}

/** Raw rows for one filtered window of the finance ledger. */
export interface FinanceSnapshot {
  expenses: ExpenseRow[];
  income: IncomeEntryRow[];
  invoices: FinanceInvoiceRow[];
  payments: FinancePaymentRow[];
  posSales: FinancePosSaleRow[];
  purchases: FinancePurchaseRow[];
  refunds: FinanceRefundRow[];
}

export interface FinanceDashboard {
  scope: { from: string | null; to: string | null; branchId: string | null };
  expensesTotal: number;
  expensesPaid: number;
  expensesPending: number;
  expenseCount: number;
  otherIncomeTotal: number;
  incomeCount: number;
  invoicedTotal: number;
  invoiceCount: number;
  outstanding: number;
  paymentsCollected: number;
  paymentCount: number;
  posSalesTotal: number;
  posSaleCount: number;
  purchaseTotal: number;
  purchaseCount: number;
  refundsProcessed: number;
  refundCount: number;
  /** Invoice payments + completed POS sales + other income. */
  collectedTotal: number;
  /** Collected cash minus paid expenses and processed refunds. */
  netCash: number;
  recentExpenses: ExpenseRow[];
  recentIncome: IncomeEntryRow[];
  recentPayments: FinancePaymentRow[];
}

export interface FinanceTransaction {
  key: string;
  source: FinanceSource;
  direction: "in" | "out";
  reference: string;
  description: string;
  date: string;
  branchId: string;
  branchName: string;
  amount: number;
  href: string;
  status?: string;
}

/**
 * Derive the consolidated transaction list from real source rows.
 *
 * Rules (mirroring the existing write paths):
 * - Only PAID expenses are cash out; pending expenses are commitments.
 * - POS sales only count when completed (void sales are excluded).
 * - Purchases only appear once received (stock cost, never an expense copy).
 * - Only processed refunds are cash out.
 */
export function buildTransactions(snapshot: FinanceSnapshot): FinanceTransaction[] {
  const rows: FinanceTransaction[] = [];

  for (const row of snapshot.expenses) {
    if (row.status !== "paid") continue;
    rows.push({
      key: `expense:${row.id}`,
      source: "expense",
      direction: "out",
      reference: row.category,
      description: row.description ?? row.reference ?? "Expense",
      date: row.expenseDate,
      branchId: row.branchId,
      branchName: row.branchName,
      amount: row.amount,
      href: `/finance/expenses/${row.id}`,
      status: row.status,
    });
  }

  for (const row of snapshot.income) {
    rows.push({
      key: `income:${row.id}`,
      source: "income",
      direction: "in",
      reference: row.category,
      description: row.description ?? row.reference ?? "Other income",
      date: row.incomeDate,
      branchId: row.branchId,
      branchName: row.branchName,
      amount: row.amount,
      href: `/finance/income/${row.id}`,
    });
  }

  for (const row of snapshot.payments) {
    rows.push({
      key: `payment:${row.id}`,
      source: "payment",
      direction: "in",
      reference: row.invoiceNumber ?? "Invoice payment",
      description: row.memberName ?? "Invoice payment",
      date: row.paidAt,
      branchId: row.branchId,
      branchName: row.branchName,
      amount: row.amount,
      href: row.invoiceId ? `/billing/invoices/${row.invoiceId}` : "/billing/payments",
    });
  }

  for (const row of snapshot.posSales) {
    if (row.status !== "completed") continue;
    rows.push({
      key: `pos_sale:${row.id}`,
      source: "pos_sale",
      direction: "in",
      reference: row.saleNumber,
      description: "Point-of-sale sale",
      date: row.soldAt,
      branchId: row.branchId,
      branchName: row.branchName,
      amount: row.total,
      href: `/pos/sales/${row.id}`,
      status: row.status,
    });
  }

  for (const row of snapshot.purchases) {
    if (row.status !== "received") continue;
    rows.push({
      key: `purchase:${row.id}`,
      source: "purchase",
      direction: "out",
      reference: row.purchaseNumber,
      description: row.supplierName ? `Stock purchase from ${row.supplierName}` : "Stock purchase",
      date: row.receivedDate ?? row.orderDate,
      branchId: row.branchId,
      branchName: row.branchName,
      amount: row.total,
      href: `/inventory/purchases/${row.id}`,
      status: row.status,
    });
  }

  for (const row of snapshot.refunds) {
    if (row.status !== "processed") continue;
    rows.push({
      key: `refund:${row.id}`,
      source: "refund",
      direction: "out",
      reference: "Refund",
      description: "Processed refund",
      date: row.processedAt ?? "",
      branchId: row.branchId,
      branchName: "",
      amount: row.amount,
      href: row.invoiceId ? `/billing/invoices/${row.invoiceId}` : "/billing/refunds",
      status: row.status,
    });
  }

  return rows.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
