/**
 * Billing client. Reads use RLS-scoped selects. Writes go through SECURITY
 * DEFINER RPCs. organization_id is never trusted from the client for writes.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import { invoiceBalance, roundMoney } from "@/lib/billing/gst";
import { installmentStatus } from "@/lib/billing/installments";
import type { OrgResult } from "@/lib/org/members";
import type {
  BillingDashboard,
  CreditNoteRow,
  InstallmentRow,
  InvoiceItemRow,
  InvoiceRow,
  OutstandingSummary,
  PaymentRow,
  RefundRow,
} from "@/lib/billing/types";

type Row = Record<string, unknown>;
type AnyTable = "gym_members";
type AnyFunction = "create_gym_member";

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

function memberName(value: unknown): string {
  const record = embed(value);
  if (!record) return "Member";
  if (record.full_name) return asString(record.full_name);
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  return joined || asString(record.code) || "Member";
}

function branchName(value: unknown): string {
  const record = embed(value);
  if (!record) return "Branch";
  if (record.name && record.code) return `${asString(record.name)} (${asString(record.code)})`;
  return asString(record.name) || "Branch";
}

function memberAddress(record: Row | null): string | null {
  if (!record) return null;
  const parts = [
    record.address_line1,
    record.address_line2,
    record.city,
    record.state,
    record.postal_code,
  ]
    .map((part) => asNullableString(part))
    .filter(Boolean);
  return parts.length ? parts.join(", ") : null;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = new Date(`${from}T00:00:00`).getTime();
  const b = new Date(`${to}T00:00:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.floor((b - a) / 86400000);
}

const INVOICE_SELECT =
  "id, organization_id, branch_id, member_id, membership_id, invoice_number, status, issue_date, due_date, sub_total, discount, tax_total, cgst, sgst, igst, round_off, total, amount_paid, amount_credited, notes, place_of_supply, tax_mode, created_at, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code, phone, email, address_line1, address_line2, city, state, postal_code)";

const ITEM_SELECT =
  "id, description, item_type, quantity, unit_price, discount, tax_rate, taxable_amount, gst_amount, cgst, sgst, igst, line_total, sort_order";

function mapInvoice(row: Row): InvoiceRow {
  const member = embed(row.gym_members);
  const total = asNumber(row.total);
  const paid = asNumber(row.amount_paid);
  const credited = asNumber(row.amount_credited);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: branchName(row.branches),
    memberId: asNullableString(row.member_id),
    memberName: memberName(row.gym_members),
    memberCode: asNullableString(member?.code),
    memberPhone: asNullableString(member?.phone),
    memberEmail: asNullableString(member?.email),
    memberAddress: memberAddress(member),
    membershipId: asNullableString(row.membership_id),
    invoiceNumber: asString(row.invoice_number),
    status: asString(row.status) || "draft",
    issueDate: asString(row.issue_date),
    dueDate: asNullableString(row.due_date),
    subTotal: asNumber(row.sub_total),
    discount: asNumber(row.discount),
    taxTotal: asNumber(row.tax_total),
    cgst: asNumber(row.cgst),
    sgst: asNumber(row.sgst),
    igst: asNumber(row.igst),
    roundOff: asNumber(row.round_off),
    total,
    amountPaid: paid,
    amountCredited: credited,
    balance: invoiceBalance(total, paid, credited),
    notes: asNullableString(row.notes),
    placeOfSupply: asNullableString(row.place_of_supply),
    taxMode: asString(row.tax_mode) || "exclusive",
    createdAt: asString(row.created_at),
  };
}

function mapItem(row: Row): InvoiceItemRow {
  return {
    id: asString(row.id),
    description: asString(row.description),
    itemType: asString(row.item_type) || "other",
    quantity: asNumber(row.quantity, 1),
    unitPrice: asNumber(row.unit_price),
    discount: asNumber(row.discount),
    taxRate: asNumber(row.tax_rate),
    taxableAmount: asNumber(row.taxable_amount),
    gstAmount: asNumber(row.gst_amount),
    cgst: asNumber(row.cgst),
    sgst: asNumber(row.sgst),
    igst: asNumber(row.igst),
    lineTotal: asNumber(row.line_total),
    sortOrder: asNumber(row.sort_order),
  };
}

function mapPayment(row: Row): PaymentRow {
  const profile = embed(row.profiles);
  const collected =
    [profile?.first_name, profile?.last_name].filter(Boolean).join(" ").trim() ||
    asNullableString(profile?.email);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    invoiceId: asNullableString(row.invoice_id),
    invoiceNumber: asNullableString(embed(row.invoices)?.invoice_number),
    memberId: asNullableString(row.member_id),
    memberName: memberName(row.gym_members),
    amount: asNumber(row.amount),
    method: asString(row.method) || "cash",
    reference: asNullableString(row.reference),
    paidAt: asString(row.paid_at),
    notes: asNullableString(row.notes),
    collectedBy: collected,
    status: "recorded",
  };
}

async function rpc(fn: string, args: Record<string, unknown>): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await (supabase.rpc as unknown as (
    name: AnyFunction,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(fn as AnyFunction, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

async function rpcVoid(fn: string, args: Record<string, unknown>): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { error } = await (supabase.rpc as unknown as (
    name: AnyFunction,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(fn as AnyFunction, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export interface InvoiceListFilters {
  organizationId: string;
  search?: string;
  status?: string;
  branchId?: string;
  memberId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchInvoices(
  filters: InvoiceListFilters,
): Promise<OrgResult<{ rows: InvoiceRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("invoices" as AnyTable)
    .select(INVOICE_SELECT, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("issue_date" as "created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") query = query.eq("status" as "id", filters.status);
  if (filters.branchId && filters.branchId !== "all") query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.memberId) query = query.eq("member_id" as "id", filters.memberId);
  if (filters.from) query = query.gte("issue_date" as "created_at", filters.from);
  if (filters.to) query = query.lte("issue_date" as "created_at", filters.to);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`invoice_number.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapInvoice), total: count ?? 0 },
    error: null,
  };
}

export async function fetchInvoice(
  organizationId: string,
  invoiceId: string,
): Promise<OrgResult<InvoiceRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("invoices" as AnyTable)
    .select(INVOICE_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", invoiceId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That item could not be found." } };

  const { data: items } = await supabase
    .from("invoice_items" as AnyTable)
    .select(ITEM_SELECT)
    .eq("invoice_id" as "id", invoiceId)
    .order("sort_order" as "created_at", { ascending: true });

  return {
    data: { ...mapInvoice(data as unknown as Row), items: ((items ?? []) as unknown as Row[]).map(mapItem) },
    error: null,
  };
}

export interface InvoiceItemInput {
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
}

export async function createInvoice(input: {
  organizationId: string;
  branchId: string;
  memberId: string;
  membershipId?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  notes?: string | null;
  placeOfSupply?: string | null;
  taxMode?: string | null;
  roundOff?: number | null;
  items: InvoiceItemInput[];
  issue: boolean;
}): Promise<OrgResult<{ id: string }>> {
  return rpc("create_invoice", {
    p_org_id: input.organizationId,
    p_branch_id: input.branchId,
    p_member_id: input.memberId,
    p_membership_id: input.membershipId ?? null,
    p_issue_date: input.issueDate ?? null,
    p_due_date: input.dueDate ?? null,
    p_notes: input.notes ?? null,
    p_place_of_supply: input.placeOfSupply ?? null,
    p_tax_mode: input.taxMode ?? "exclusive",
    p_round_off: input.roundOff ?? 0,
    p_items: input.items.map((item) => ({
      description: item.description,
      item_type: item.itemType,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount: item.discount,
      tax_rate: item.taxRate,
    })),
    p_issue: input.issue,
  });
}

export async function issueInvoice(invoiceId: string): Promise<OrgResult> {
  return rpcVoid("issue_invoice", { p_invoice_id: invoiceId });
}

export async function voidInvoice(invoiceId: string, reason?: string | null): Promise<OrgResult> {
  return rpcVoid("void_invoice", { p_invoice_id: invoiceId, p_reason: reason ?? null });
}

export async function recordPayment(input: {
  organizationId: string;
  invoiceId: string;
  amount: number;
  method: string;
  reference?: string | null;
  paidAt?: string | null;
  notes?: string | null;
}): Promise<OrgResult<{ id: string }>> {
  return rpc("record_payment", {
    p_org_id: input.organizationId,
    p_invoice_id: input.invoiceId,
    p_amount: input.amount,
    p_method: input.method,
    p_reference: input.reference ?? null,
    p_paid_at: input.paidAt ?? null,
    p_notes: input.notes ?? null,
  });
}

export async function createInstallmentSchedule(
  invoiceId: string,
  count: number,
  startDate?: string | null,
): Promise<OrgResult> {
  return rpcVoid("create_installment_schedule", {
    p_invoice_id: invoiceId,
    p_count: count,
    p_start_date: startDate ?? null,
  });
}

export async function createCreditNote(input: {
  organizationId: string;
  invoiceId: string;
  reason: string;
  notes?: string | null;
  items: InvoiceItemInput[];
  apply: boolean;
}): Promise<OrgResult<{ id: string }>> {
  return rpc("create_credit_note", {
    p_org_id: input.organizationId,
    p_invoice_id: input.invoiceId,
    p_reason: input.reason,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      discount: item.discount,
      tax_rate: item.taxRate,
    })),
    p_apply: input.apply,
  });
}

export async function applyCreditNote(id: string): Promise<OrgResult> {
  return rpcVoid("apply_credit_note", { p_credit_note_id: id });
}

export async function voidCreditNote(id: string): Promise<OrgResult> {
  return rpcVoid("void_credit_note", { p_credit_note_id: id });
}

export async function requestRefund(input: {
  organizationId: string;
  paymentId: string;
  amount: number;
  method: string;
  reason?: string | null;
  notes?: string | null;
}): Promise<OrgResult<{ id: string }>> {
  return rpc("request_refund", {
    p_org_id: input.organizationId,
    p_payment_id: input.paymentId,
    p_amount: input.amount,
    p_method: input.method,
    p_reason: input.reason ?? null,
    p_notes: input.notes ?? null,
  });
}

export async function setRefundStatus(id: string, status: string): Promise<OrgResult> {
  return rpcVoid("set_refund_status", { p_refund_id: id, p_status: status });
}

export async function fetchPayments(
  organizationId: string,
  opts: {
    search?: string;
    method?: string;
    memberId?: string;
    from?: string;
    to?: string;
    page?: number;
    pageSize?: number;
  } = {},
): Promise<OrgResult<{ rows: PaymentRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, opts.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, opts.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("payments" as AnyTable)
    .select(
      "id, organization_id, branch_id, invoice_id, member_id, amount, method, reference, paid_at, notes, created_by, invoices(invoice_number), gym_members(full_name, first_name, last_name, code)",
      { count: "exact" },
    )
    .eq("organization_id", organizationId)
    .order("paid_at" as "created_at", { ascending: false })
    .range(from, to);

  if (opts.method && opts.method !== "all") query = query.eq("method" as "id", opts.method);
  if (opts.memberId) query = query.eq("member_id" as "id", opts.memberId);
  if (opts.from) query = query.gte("paid_at" as "created_at", opts.from);
  if (opts.to) query = query.lte("paid_at" as "created_at", `${opts.to}T23:59:59`);
  const search = opts.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`reference.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapPayment), total: count ?? 0 },
    error: null,
  };
}

export async function fetchInstallments(
  organizationId: string,
): Promise<OrgResult<InstallmentRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("installments" as AnyTable)
    .select(
      "id, invoice_id, due_date, amount, paid_amount, status, sort_order, invoices(invoice_number, total, member_id, gym_members(full_name, first_name, last_name, code))",
    )
    .eq("organization_id", organizationId)
    .order("due_date" as "created_at", { ascending: true });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  const today = todayIso();
  const rows = ((data ?? []) as unknown as Row[]).map((row) => {
    const invoice = embed(row.invoices);
    const amount = asNumber(row.amount);
    const paid = asNumber(row.paid_amount);
    return {
      id: asString(row.id),
      invoiceId: asString(row.invoice_id),
      invoiceNumber: asString(invoice?.invoice_number),
      memberName: memberName(invoice?.gym_members),
      dueDate: asString(row.due_date),
      amount,
      paidAmount: paid,
      remaining: roundMoney(Math.max(amount - paid, 0)),
      status: installmentStatus(asString(row.due_date), amount, paid, today),
      sortOrder: asNumber(row.sort_order),
      invoiceTotal: asNumber(invoice?.total),
    } satisfies InstallmentRow;
  });
  return { data: rows, error: null };
}

export async function fetchCreditNotes(
  organizationId: string,
): Promise<OrgResult<CreditNoteRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("credit_notes" as AnyTable)
    .select(
      "id, credit_number, invoice_id, member_id, issue_date, amount, tax_total, reason, notes, status, invoices(invoice_number), gym_members(full_name, first_name, last_name, code)",
    )
    .eq("organization_id", organizationId)
    .order("issue_date" as "created_at", { ascending: false });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      creditNumber: asString(row.credit_number),
      invoiceId: asNullableString(row.invoice_id),
      invoiceNumber: asNullableString(embed(row.invoices)?.invoice_number),
      memberId: asNullableString(row.member_id),
      memberName: memberName(row.gym_members),
      issueDate: asString(row.issue_date),
      amount: asNumber(row.amount),
      taxTotal: asNumber(row.tax_total),
      reason: asNullableString(row.reason),
      notes: asNullableString(row.notes),
      status: asString(row.status),
    })),
    error: null,
  };
}

export async function fetchRefunds(organizationId: string): Promise<OrgResult<RefundRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("refunds" as AnyTable)
    .select(
      "id, payment_id, invoice_id, member_id, amount, method, reason, notes, status, created_at, processed_at, invoices(invoice_number), gym_members(full_name, first_name, last_name, code)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      paymentId: asNullableString(row.payment_id),
      invoiceId: asNullableString(row.invoice_id),
      invoiceNumber: asNullableString(embed(row.invoices)?.invoice_number),
      memberId: asNullableString(row.member_id),
      memberName: memberName(row.gym_members),
      amount: asNumber(row.amount),
      method: asString(row.method) || "original",
      reason: asNullableString(row.reason),
      notes: asNullableString(row.notes),
      status: asString(row.status),
      createdAt: asString(row.created_at),
      processedAt: asNullableString(row.processed_at),
    })),
    error: null,
  };
}

export async function fetchInvoicePayments(
  organizationId: string,
  invoiceId: string,
): Promise<OrgResult<PaymentRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("payments" as AnyTable)
    .select(
      "id, organization_id, branch_id, invoice_id, member_id, amount, method, reference, paid_at, notes, created_by, invoices(invoice_number), gym_members(full_name, first_name, last_name, code)",
    )
    .eq("organization_id", organizationId)
    .eq("invoice_id" as "id", invoiceId)
    .order("paid_at" as "created_at", { ascending: false });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: ((data ?? []) as unknown as Row[]).map(mapPayment), error: null };
}

export async function fetchOpenInvoices(organizationId: string): Promise<OrgResult<InvoiceRow[]>> {
  const result = await fetchInvoices({ organizationId, pageSize: 100 });
  if (result.error) return result;
  return {
    data: result.data.rows.filter((row) =>
      ["issued", "partially_paid", "overdue"].includes(row.status),
    ),
    error: null,
  };
}

export async function fetchBillingDashboard(
  organizationId: string,
): Promise<OrgResult<BillingDashboard>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = todayIso();
  const monthStart = `${today.slice(0, 7)}-01`;
  const start = new Date();
  start.setDate(start.getDate() - 29);
  const trendStart = start.toISOString().slice(0, 10);

  const [invoices, payments, installments] = await Promise.all([
    fetchInvoices({ organizationId, pageSize: 100 }),
    fetchPayments(organizationId, { from: trendStart, pageSize: 100 }),
    fetchInstallments(organizationId),
  ]);
  if (invoices.error) return { data: null, error: invoices.error };
  if (payments.error) return { data: null, error: payments.error };
  if (installments.error) return { data: null, error: installments.error };

  const invoiceRows = invoices.data.rows;
  const paymentRows = payments.data.rows;
  const installmentRows = installments.data;

  const todayRevenue = roundMoney(
    paymentRows.filter((row) => row.paidAt.slice(0, 10) === today).reduce((sum, row) => sum + row.amount, 0),
  );
  const monthlyRevenue = roundMoney(
    paymentRows.filter((row) => row.paidAt.slice(0, 10) >= monthStart).reduce((sum, row) => sum + row.amount, 0),
  );
  const outstanding = roundMoney(
    invoiceRows
      .filter((row) => ["issued", "partially_paid", "overdue"].includes(row.status))
      .reduce((sum, row) => sum + row.balance, 0),
  );
  const overdue = roundMoney(
    invoiceRows.filter((row) => row.status === "overdue").reduce((sum, row) => sum + row.balance, 0),
  );

  const trendMap = new Map<string, number>();
  for (let i = 29; i >= 0; i -= 1) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    trendMap.set(date.toISOString().slice(0, 10), 0);
  }
  for (const row of paymentRows) {
    const key = row.paidAt.slice(0, 10);
    if (trendMap.has(key)) trendMap.set(key, roundMoney((trendMap.get(key) ?? 0) + row.amount));
  }

  const methodMap = new Map<string, number>();
  for (const row of paymentRows.filter((item) => item.paidAt.slice(0, 10) >= monthStart)) {
    methodMap.set(row.method, roundMoney((methodMap.get(row.method) ?? 0) + row.amount));
  }

  return {
    data: {
      todayRevenue,
      monthlyRevenue,
      outstanding,
      overdue,
      paidCount: invoiceRows.filter((row) => row.status === "paid").length,
      unpaidCount: invoiceRows.filter((row) =>
        ["issued", "partially_paid", "overdue"].includes(row.status),
      ).length,
      installmentsDue: installmentRows.filter((row) =>
        ["due", "overdue", "partially_paid"].includes(row.status),
      ).length,
      revenueTrend: [...trendMap.entries()].map(([label, value]) => ({
        label: label.slice(5),
        value,
      })),
      methodSummary: [...methodMap.entries()].map(([method, amount]) => ({ method, amount })),
      recentInvoices: invoiceRows.slice(0, 6),
      recentPayments: paymentRows.slice(0, 6),
      upcomingDues: installmentRows
        .filter((row) => row.status !== "paid")
        .slice(0, 6),
    },
    error: null,
  };
}

export async function fetchOutstanding(
  organizationId: string,
): Promise<OrgResult<OutstandingSummary>> {
  const result = await fetchInvoices({ organizationId, pageSize: 100 });
  if (result.error) return result;
  const today = todayIso();
  const weekEnd = new Date();
  weekEnd.setDate(weekEnd.getDate() + 7);
  const weekIso = weekEnd.toISOString().slice(0, 10);
  const monthEnd = `${today.slice(0, 7)}-31`;
  const rows = result.data.rows.filter((row) =>
    ["issued", "partially_paid", "overdue"].includes(row.status),
  );

  const aging = { current: 0, days1to7: 0, days8to30: 0, days31to60: 0, days60plus: 0 };
  let dueToday = 0;
  let dueThisWeek = 0;
  let overdue = 0;
  let dueThisMonth = 0;
  let total = 0;

  for (const row of rows) {
    total += row.balance;
    const due = row.dueDate ?? row.issueDate;
    const overdueDays = Math.max(daysBetween(due, today), 0);
    if (due === today) dueToday += row.balance;
    if (due >= today && due <= weekIso) dueThisWeek += row.balance;
    if (due < today) overdue += row.balance;
    if (due >= today && due <= monthEnd) dueThisMonth += row.balance;
    if (overdueDays <= 0) aging.current += row.balance;
    else if (overdueDays <= 7) aging.days1to7 += row.balance;
    else if (overdueDays <= 30) aging.days8to30 += row.balance;
    else if (overdueDays <= 60) aging.days31to60 += row.balance;
    else aging.days60plus += row.balance;
  }

  return {
    data: {
      total: roundMoney(total),
      dueToday: roundMoney(dueToday),
      dueThisWeek: roundMoney(dueThisWeek),
      overdue: roundMoney(overdue),
      dueThisMonth: roundMoney(dueThisMonth),
      aging: {
        current: roundMoney(aging.current),
        days1to7: roundMoney(aging.days1to7),
        days8to30: roundMoney(aging.days8to30),
        days31to60: roundMoney(aging.days31to60),
        days60plus: roundMoney(aging.days60plus),
      },
      rows,
    },
    error: null,
  };
}

export async function fetchMemberForInvoice(
  organizationId: string,
  memberId: string,
  membershipId?: string | null,
): Promise<
  OrgResult<{
    id: string;
    fullName: string;
    code: string;
    phone: string;
    email: string | null;
    address: string | null;
    branchId: string;
    membership: {
      id: string;
      planName: string;
      startDate: string;
      endDate: string;
      status: string;
    } | null;
  }>
> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("gym_members")
    .select("id, full_name, first_name, last_name, code, phone, email, branch_id, address_line1, address_line2, city, state, postal_code")
    .eq("organization_id", organizationId)
    .eq("id", memberId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That item could not be found." } };
  const row = data as unknown as Row;

  let membershipQuery = supabase
    .from("memberships" as AnyTable)
    .select("id, status, start_date, end_date, membership_plans(name)")
    .eq("organization_id", organizationId)
    .eq("member_id" as "id", memberId)
    .order("end_date" as "created_at", { ascending: false })
    .limit(1);
  if (membershipId) {
    membershipQuery = membershipQuery.eq("id" as "id", membershipId);
  } else {
    membershipQuery = membershipQuery.eq("status" as "id", "active");
  }
  const { data: memberships } = await membershipQuery;

  const membership = ((memberships ?? []) as unknown as Row[])[0];
  return {
    data: {
      id: asString(row.id),
      fullName: memberName(row),
      code: asString(row.code),
      phone: asString(row.phone),
      email: asNullableString(row.email),
      address: memberAddress(row),
      branchId: asString(row.branch_id),
      membership: membership
        ? {
            id: asString(membership.id),
            planName: asString(embed(membership.membership_plans)?.name) || "Plan",
            startDate: asString(membership.start_date),
            endDate: asString(membership.end_date),
            status: asString(membership.status),
          }
        : null,
    },
    error: null,
  };
}

export async function fetchGstRates(organizationId: string): Promise<OrgResult<{ id: string; name: string; rate: number; isDefault: boolean }[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("gst_rates" as AnyTable)
    .select("id, name, rate, is_default, is_active")
    .eq("organization_id", organizationId)
    .order("rate" as "created_at", { ascending: true });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[])
      .filter((row) => row.is_active !== false)
      .map((row) => ({
        id: asString(row.id),
        name: asString(row.name),
        rate: asNumber(row.rate),
        isDefault: Boolean(row.is_default),
      })),
    error: null,
  };
}
