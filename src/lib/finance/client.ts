/**
 * Phase 8 finance data layer.
 *
 * Reads use RLS-scoped selects against the existing tables and existing
 * billing reads. Writes go only through the Phase 8 SECURITY DEFINER RPCs
 * (`create_expense`, `update_expense`, `create_income_entry`,
 * `update_income_entry`); `organization_id` is derived server-side.
 *
 * The dashboard never adds invoice totals, payments and POS totals into a
 * single "revenue" number:
 *   - invoiced total  = invoice totals for issued/paid/partial/overdue rows
 *   - collected cash  = persisted payments + completed POS sales + other income
 *   - outstanding     = invoice balances (receivables, explicitly not cash)
 *   - purchase costs  = received purchase totals (cost visibility only)
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import { roundMoney } from "@/lib/billing/gst";
import { fetchInvoices, fetchPayments } from "@/lib/billing/client";
import type { OrgResult } from "@/lib/org/members";
import type {
  ExpenseRow,
  FinanceDashboard,
  FinanceInvoiceRow,
  FinancePaymentRow,
  FinancePosSaleRow,
  FinancePurchaseRow,
  FinanceRefundRow,
  FinanceScope,
  FinanceSnapshot,
  IncomeEntryRow,
} from "@/lib/finance/types";

type Row = Record<string, unknown>;
type AnyTable = "expenses" | "income_entries" | "pos_sales" | "purchases" | "refunds";
type AnyFunction =
  | "create_expense"
  | "update_expense"
  | "create_income_entry"
  | "update_income_entry";

const ACTIVE_INVOICE_STATUSES = ["issued", "partially_paid", "overdue", "paid"] as const;

function clientOrNull() {
  return getSupabaseBrowserClient();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function embed(value: unknown): Row | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Row | null;
}

function branchName(value: unknown): string {
  const record = embed(value);
  if (!record) return "Branch";
  if (record.name && record.code) return `${asString(record.name)} (${asString(record.code)})`;
  return asString(record.name) || "Branch";
}

function memberName(value: unknown): string | null {
  const record = embed(value);
  if (!record) return null;
  if (record.full_name) return asString(record.full_name);
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  return joined || asString(record.code) || null;
}

function sumBy<T>(rows: T[], value: (row: T) => number): number {
  return roundMoney(rows.reduce((total, row) => total + value(row), 0));
}

async function rpc(
  fn: AnyFunction,
  args: Record<string, unknown>,
): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: AnyFunction,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  )(fn, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

async function rpcVoid(fn: AnyFunction, args: Record<string, unknown>): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { error } = await (
    supabase.rpc as unknown as (
      name: AnyFunction,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  )(fn, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

/* ---------------------------------------------------------------------------
   Expenses
   --------------------------------------------------------------------------- */

const EXPENSE_SELECT =
  "id, organization_id, branch_id, category, description, amount, expense_date, payment_method, status, reference, created_at, updated_at, branches(id, name, code)";

function mapExpense(row: Row): ExpenseRow {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: branchName(row.branches),
    category: asString(row.category),
    description: asNullableString(row.description),
    amount: asNumber(row.amount),
    expenseDate: asString(row.expense_date),
    paymentMethod: asString(row.payment_method) || "cash",
    status: asString(row.status) || "paid",
    reference: asNullableString(row.reference),
    createdAt: asString(row.created_at),
    updatedAt: asString(row.updated_at),
  };
}

export interface ExpenseListFilters {
  organizationId: string;
  search?: string;
  category?: string;
  status?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchExpenses(
  filters: ExpenseListFilters,
): Promise<OrgResult<{ rows: ExpenseRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("expenses" as AnyTable)
    .select(EXPENSE_SELECT, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("expense_date" as "created_at", { ascending: false })
    .order("created_at" as "id", { ascending: false })
    .range(from, to);

  if (filters.category && filters.category !== "all")
    query = query.eq("category" as "id", filters.category);
  if (filters.status && filters.status !== "all")
    query = query.eq("status" as "id", filters.status);
  if (filters.branchId && filters.branchId !== "all")
    query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.from) query = query.gte("expense_date" as "created_at", filters.from);
  if (filters.to) query = query.lte("expense_date" as "created_at", filters.to);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`description.ilike.%${escaped}%,reference.ilike.%${escaped}%,category.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapExpense), total: count ?? 0 },
    error: null,
  };
}

export async function fetchExpense(
  organizationId: string,
  expenseId: string,
): Promise<OrgResult<ExpenseRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("expenses" as AnyTable)
    .select(EXPENSE_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", expenseId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That expense could not be found." } };
  return { data: mapExpense(data as unknown as Row), error: null };
}

export interface ExpenseInput {
  branchId: string;
  category: string;
  description?: string | null;
  amount: number;
  expenseDate: string;
  paymentMethod: string;
  status: string;
  reference?: string | null;
}

export async function createExpense(
  organizationId: string,
  input: ExpenseInput,
): Promise<OrgResult<{ id: string }>> {
  return rpc("create_expense", {
    p_org_id: organizationId,
    p_branch_id: input.branchId,
    p_category: input.category,
    p_description: input.description ?? null,
    p_amount: roundMoney(input.amount),
    p_expense_date: input.expenseDate,
    p_payment_method: input.paymentMethod,
    p_status: input.status,
    p_reference: input.reference ?? null,
  });
}

export async function updateExpense(
  expenseId: string,
  input: ExpenseInput,
): Promise<OrgResult> {
  return rpcVoid("update_expense", {
    p_expense_id: expenseId,
    p_branch_id: input.branchId,
    p_category: input.category,
    p_description: input.description ?? null,
    p_amount: roundMoney(input.amount),
    p_expense_date: input.expenseDate,
    p_payment_method: input.paymentMethod,
    p_status: input.status,
    p_reference: input.reference ?? null,
  });
}

/* ---------------------------------------------------------------------------
   Other income
   --------------------------------------------------------------------------- */

const INCOME_SELECT =
  "id, organization_id, branch_id, category, description, amount, income_date, payment_method, reference, created_at, branches(id, name, code)";

function mapIncome(row: Row): IncomeEntryRow {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: branchName(row.branches),
    category: asString(row.category),
    description: asNullableString(row.description),
    amount: asNumber(row.amount),
    incomeDate: asString(row.income_date),
    paymentMethod: asString(row.payment_method) || "cash",
    reference: asNullableString(row.reference),
    createdAt: asString(row.created_at),
  };
}

export interface IncomeListFilters {
  organizationId: string;
  search?: string;
  category?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchIncomeEntries(
  filters: IncomeListFilters,
): Promise<OrgResult<{ rows: IncomeEntryRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(200, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("income_entries" as AnyTable)
    .select(INCOME_SELECT, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("income_date" as "created_at", { ascending: false })
    .order("created_at" as "id", { ascending: false })
    .range(from, to);

  if (filters.category && filters.category !== "all")
    query = query.eq("category" as "id", filters.category);
  if (filters.branchId && filters.branchId !== "all")
    query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.from) query = query.gte("income_date" as "created_at", filters.from);
  if (filters.to) query = query.lte("income_date" as "created_at", filters.to);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`description.ilike.%${escaped}%,reference.ilike.%${escaped}%,category.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapIncome), total: count ?? 0 },
    error: null,
  };
}

export async function fetchIncomeEntry(
  organizationId: string,
  entryId: string,
): Promise<OrgResult<IncomeEntryRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("income_entries" as AnyTable)
    .select(INCOME_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", entryId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That income entry could not be found." } };
  return { data: mapIncome(data as unknown as Row), error: null };
}

export interface IncomeInput {
  branchId: string;
  category: string;
  description?: string | null;
  amount: number;
  incomeDate: string;
  paymentMethod: string;
  reference?: string | null;
}

export async function createIncomeEntry(
  organizationId: string,
  input: IncomeInput,
): Promise<OrgResult<{ id: string }>> {
  return rpc("create_income_entry", {
    p_org_id: organizationId,
    p_branch_id: input.branchId,
    p_category: input.category,
    p_description: input.description ?? null,
    p_amount: roundMoney(input.amount),
    p_income_date: input.incomeDate,
    p_payment_method: input.paymentMethod,
    p_reference: input.reference ?? null,
  });
}

export async function updateIncomeEntry(
  entryId: string,
  input: IncomeInput,
): Promise<OrgResult> {
  return rpcVoid("update_income_entry", {
    p_income_entry_id: entryId,
    p_branch_id: input.branchId,
    p_category: input.category,
    p_description: input.description ?? null,
    p_amount: roundMoney(input.amount),
    p_income_date: input.incomeDate,
    p_payment_method: input.paymentMethod,
    p_reference: input.reference ?? null,
  });
}

/* ---------------------------------------------------------------------------
   Transaction sources (POS, purchases, refunds) + full snapshot
   --------------------------------------------------------------------------- */

async function fetchPosSales(
  scope: FinanceScope,
): Promise<OrgResult<FinancePosSaleRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("pos_sales" as AnyTable)
    .select("id, branch_id, sale_number, status, total, payment_method, sold_at, branches(id, name, code)")
    .eq("organization_id", scope.organizationId)
    .order("sold_at" as "created_at", { ascending: false })
    .limit(5000);
  if (scope.branchId && scope.branchId !== "all")
    query = query.eq("branch_id" as "id", scope.branchId);
  if (scope.from) query = query.gte("sold_at" as "created_at", `${scope.from}T00:00:00`);
  if (scope.to) query = query.lte("sold_at" as "created_at", `${scope.to}T23:59:59`);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      branchId: asString(row.branch_id),
      branchName: branchName(row.branches),
      saleNumber: asString(row.sale_number),
      status: asString(row.status) || "completed",
      total: asNumber(row.total),
      paymentMethod: asString(row.payment_method) || "cash",
      soldAt: asString(row.sold_at),
    })),
    error: null,
  };
}

async function fetchPurchasesForFinance(
  scope: FinanceScope,
): Promise<OrgResult<FinancePurchaseRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("purchases" as AnyTable)
    .select(
      "id, branch_id, purchase_number, status, order_date, received_date, total, suppliers(name), branches(id, name, code)",
    )
    .eq("organization_id", scope.organizationId)
    .eq("status" as "id", "received")
    .order("received_date" as "created_at", { ascending: false })
    .limit(5000);
  if (scope.branchId && scope.branchId !== "all")
    query = query.eq("branch_id" as "id", scope.branchId);
  if (scope.from) query = query.gte("received_date" as "created_at", scope.from);
  if (scope.to) query = query.lte("received_date" as "created_at", scope.to);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      branchId: asString(row.branch_id),
      branchName: branchName(row.branches),
      purchaseNumber: asString(row.purchase_number),
      supplierName: asNullableString(embed(row.suppliers)?.name),
      status: asString(row.status),
      orderDate: asString(row.order_date),
      receivedDate: asNullableString(row.received_date),
      total: asNumber(row.total),
    })),
    error: null,
  };
}

async function fetchRefundsForFinance(
  scope: FinanceScope,
): Promise<OrgResult<FinanceRefundRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("refunds" as AnyTable)
    .select("id, branch_id, invoice_id, amount, status, processed_at")
    .eq("organization_id", scope.organizationId)
    .eq("status" as "id", "processed")
    .order("processed_at" as "created_at", { ascending: false })
    .limit(5000);
  if (scope.branchId && scope.branchId !== "all")
    query = query.eq("branch_id" as "id", scope.branchId);
  if (scope.from) query = query.gte("processed_at" as "created_at", `${scope.from}T00:00:00`);
  if (scope.to) query = query.lte("processed_at" as "created_at", `${scope.to}T23:59:59`);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      branchId: asString(row.branch_id),
      invoiceId: asNullableString(row.invoice_id),
      amount: asNumber(row.amount),
      status: asString(row.status),
      processedAt: asNullableString(row.processed_at),
    })),
    error: null,
  };
}

async function fetchAllExpenses(scope: FinanceScope): Promise<OrgResult<ExpenseRow[]>> {
  const rows: ExpenseRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchExpenses({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      from: scope.from,
      to: scope.to,
      page,
      pageSize: 200,
    });
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data.rows);
    if (rows.length >= result.data.total || result.data.rows.length === 0) break;
  }
  return { data: rows, error: null };
}

async function fetchAllIncome(scope: FinanceScope): Promise<OrgResult<IncomeEntryRow[]>> {
  const rows: IncomeEntryRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchIncomeEntries({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      from: scope.from,
      to: scope.to,
      page,
      pageSize: 200,
    });
    if (result.error) return { data: null, error: result.error };
    rows.push(...result.data.rows);
    if (rows.length >= result.data.total || result.data.rows.length === 0) break;
  }
  return { data: rows, error: null };
}

async function fetchAllInvoices(scope: FinanceScope): Promise<OrgResult<FinanceInvoiceRow[]>> {
  const rows: FinanceInvoiceRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchInvoices({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      from: scope.from,
      to: scope.to,
      page,
      pageSize: 100,
    });
    if (result.error) return { data: null, error: result.error };
    rows.push(
      ...result.data.rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        invoiceNumber: row.invoiceNumber,
        memberName: row.memberName === "Member" ? null : row.memberName,
        status: row.status,
        issueDate: row.issueDate,
        dueDate: row.dueDate,
        total: row.total,
        amountPaid: row.amountPaid,
        amountCredited: row.amountCredited,
        balance: row.balance,
      })),
    );
    if (rows.length >= result.data.total || result.data.rows.length === 0) break;
  }
  return { data: rows, error: null };
}

async function fetchAllPayments(scope: FinanceScope): Promise<OrgResult<FinancePaymentRow[]>> {
  const rows: FinancePaymentRow[] = [];
  for (let page = 1; page <= 50; page += 1) {
    const result = await fetchPayments(scope.organizationId, {
      branchId: scope.branchId,
      from: scope.from,
      to: scope.to,
      page,
      pageSize: 100,
    });
    if (result.error) return { data: null, error: result.error };
    rows.push(
      ...result.data.rows.map((row) => ({
        id: row.id,
        branchId: row.branchId,
        branchName: row.branchName,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        memberName: row.memberName === "Member" ? null : row.memberName,
        amount: row.amount,
        method: row.method,
        paidAt: row.paidAt,
      })),
    );
    if (rows.length >= result.data.total || result.data.rows.length === 0) break;
  }
  return { data: rows, error: null };
}

/** Load every real source row for one filtered window. */
export async function fetchFinanceSnapshot(scope: FinanceScope): Promise<OrgResult<FinanceSnapshot>> {
  const [expenses, income, invoices, payments, posSales, purchases, refunds] = await Promise.all([
    fetchAllExpenses(scope),
    fetchAllIncome(scope),
    fetchAllInvoices(scope),
    fetchAllPayments(scope),
    fetchPosSales(scope),
    fetchPurchasesForFinance(scope),
    fetchRefundsForFinance(scope),
  ]);
  const error =
    expenses.error ??
    income.error ??
    invoices.error ??
    payments.error ??
    posSales.error ??
    purchases.error ??
    refunds.error;
  if (error) return { data: null, error };
  return {
    data: {
      expenses: expenses.data ?? [],
      income: income.data ?? [],
      invoices: invoices.data ?? [],
      payments: payments.data ?? [],
      posSales: posSales.data ?? [],
      purchases: purchases.data ?? [],
      refunds: refunds.data ?? [],
    },
    error: null,
  };
}

export function computeFinanceDashboard(
  scope: FinanceScope,
  snapshot: FinanceSnapshot,
): FinanceDashboard {
  const activeInvoices = snapshot.invoices.filter((row) =>
    (ACTIVE_INVOICE_STATUSES as readonly string[]).includes(row.status),
  );
  const openInvoices = snapshot.invoices.filter((row) =>
    ["issued", "partially_paid", "overdue"].includes(row.status),
  );
  const paidExpenses = snapshot.expenses.filter((row) => row.status === "paid");
  const pendingExpenses = snapshot.expenses.filter((row) => row.status === "pending");
  const completedSales = snapshot.posSales.filter((row) => row.status === "completed");
  const receivedPurchases = snapshot.purchases.filter((row) => row.status === "received");
  const processedRefunds = snapshot.refunds.filter((row) => row.status === "processed");

  const expensesPaid = sumBy(paidExpenses, (row) => row.amount);
  const expensesPending = sumBy(pendingExpenses, (row) => row.amount);
  const otherIncomeTotal = sumBy(snapshot.income, (row) => row.amount);
  const invoicedTotal = sumBy(activeInvoices, (row) => row.total);
  const outstanding = sumBy(openInvoices, (row) => row.balance);
  const paymentsCollected = sumBy(snapshot.payments, (row) => row.amount);
  const posSalesTotal = sumBy(completedSales, (row) => row.total);
  const purchaseTotal = sumBy(receivedPurchases, (row) => row.total);
  const refundsProcessed = sumBy(processedRefunds, (row) => row.amount);

  const collectedTotal = roundMoney(paymentsCollected + posSalesTotal + otherIncomeTotal);
  const netCash = roundMoney(collectedTotal - expensesPaid - refundsProcessed);

  return {
    scope: {
      from: scope.from ?? null,
      to: scope.to ?? null,
      branchId: scope.branchId && scope.branchId !== "all" ? scope.branchId : null,
    },
    expensesTotal: roundMoney(expensesPaid + expensesPending),
    expensesPaid,
    expensesPending,
    expenseCount: snapshot.expenses.length,
    otherIncomeTotal,
    incomeCount: snapshot.income.length,
    invoicedTotal,
    invoiceCount: activeInvoices.length,
    outstanding,
    paymentsCollected,
    paymentCount: snapshot.payments.length,
    posSalesTotal,
    posSaleCount: completedSales.length,
    purchaseTotal,
    purchaseCount: receivedPurchases.length,
    refundsProcessed,
    refundCount: processedRefunds.length,
    collectedTotal,
    netCash,
    recentExpenses: snapshot.expenses.slice(0, 5),
    recentIncome: snapshot.income.slice(0, 5),
    recentPayments: snapshot.payments.slice(0, 5),
  };
}

export async function fetchFinanceDashboard(
  scope: FinanceScope,
): Promise<OrgResult<FinanceDashboard>> {
  const result = await fetchFinanceSnapshot(scope);
  if (result.error) return { data: null, error: result.error };
  return { data: computeFinanceDashboard(scope, result.data), error: null };
}

/* ---------------------------------------------------------------------------
   Categories (existing free-text columns - suggestions only)
   --------------------------------------------------------------------------- */

export interface FinanceCategories {
  expense: string[];
  income: string[];
}

export async function fetchFinanceCategories(
  organizationId: string,
): Promise<OrgResult<FinanceCategories>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const [expenses, income] = await Promise.all([
    supabase
      .from("expenses" as AnyTable)
      .select("category")
      .eq("organization_id", organizationId)
      .limit(1000),
    supabase
      .from("income_entries" as AnyTable)
      .select("category")
      .eq("organization_id", organizationId)
      .limit(1000),
  ]);
  if (expenses.error || income.error) {
    return { data: null, error: { message: friendlyMessage(expenses.error ?? income.error) } };
  }
  const collect = (rows: unknown): string[] =>
    Array.from(
      new Set(
        ((rows ?? []) as Row[])
          .map((row) => asString(row.category).trim())
          .filter((value) => value.length > 0),
      ),
    ).sort((a, b) => a.localeCompare(b));
  return {
    data: { expense: collect(expenses.data), income: collect(income.data) },
    error: null,
  };
}
