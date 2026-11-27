/**
 * Membership operations client (Phase 3.2c).
 *
 * Reads use RLS-scoped selects. Writes go through SECURITY DEFINER RPCs
 * (`extend_membership`, `renew_membership`). organization_id is never trusted
 * from the client for writes. Freeze remains a membership timeline event.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult, AuditLogRow } from "@/lib/org/members";
import type { MembershipRow } from "@/lib/operations/adapters";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

type Row = Record<string, unknown>;
type AnyTable = "gym_members";

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

function embedName(value: unknown): string | null {
  if (!value) return null;
  const record = (Array.isArray(value) ? value[0] : value) as
    | {
        name?: string;
        code?: string;
        full_name?: string;
        first_name?: string;
        last_name?: string;
      }
    | null;
  if (!record) return null;
  if (record.full_name) return record.full_name;
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (record.name && record.code) return `${record.name} (${record.code})`;
  return record.name ?? null;
}

const MEMBERSHIP_SELECT =
  "id, organization_id, branch_id, member_id, plan_id, status, start_date, end_date, price, discount, final_amount, freeze_days_used, notes, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code), membership_plans(id, name, code, duration_days, max_freeze_days)";

function embedRecord(value: unknown): Row | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Row | null;
}

function mapMembershipRow(row: Row): MembershipRow {
  const plan = embedRecord(row.membership_plans);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    planId: asString(row.plan_id),
    planName: embedName(row.membership_plans) ?? "Plan",
    status: asString(row.status) || "active",
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    price: asNumber(row.price),
    discount: asNumber(row.discount),
    finalAmount: asNumber(row.final_amount),
    freezeDaysUsed: asNumber(row.freeze_days_used),
    planDurationDays: asNumber(plan?.duration_days),
    planMaxFreezeDays: asNumber(plan?.max_freeze_days),
    notes: asNullableString(row.notes),
  };
}

export async function fetchMembershipsForMember(
  organizationId: string,
  memberId: string,
): Promise<OrgResult<MembershipRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("memberships" as AnyTable)
    .select(MEMBERSHIP_SELECT)
    .eq("organization_id", organizationId)
    .eq("member_id" as "id", memberId)
    .order("end_date" as "created_at", { ascending: false });

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: ((data ?? []) as unknown as Row[]).map(mapMembershipRow), error: null };
}

const ACTOR_NAME_FIELDS = "id, first_name, last_name, email";

export async function fetchMembershipHistory(
  organizationId: string,
  membershipId: string,
): Promise<OrgResult<AuditLogRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`id, action, target_type, target_id, metadata, created_at, profiles(${ACTOR_NAME_FIELDS})`)
    .eq("organization_id", organizationId)
    .eq("target_type", "membership")
    .eq("target_id", membershipId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const rows: AuditLogRow[] = (data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
    const actorName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || null;
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actorName,
      metadata:
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: row.created_at,
    };
  });

  return { data: rows, error: null };
}

export interface MembershipFreezeEvent {
  id: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
  createdAt: string;
}

export async function fetchMembershipFreezes(
  organizationId: string,
  membershipId: string,
): Promise<OrgResult<MembershipFreezeEvent[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("membership_freezes" as AnyTable)
    .select("id, start_date, end_date, days, reason, created_at")
    .eq("organization_id", organizationId)
    .eq("membership_id" as "id", membershipId)
    .order("start_date" as "created_at", { ascending: false });

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      startDate: asString(row.start_date),
      endDate: asString(row.end_date),
      days: asNumber(row.days),
      reason: asNullableString(row.reason),
      createdAt: asString(row.created_at),
    })),
    error: null,
  };
}

export async function createMembership(input: {
  organizationId: string;
  branchId: string;
  memberId: string;
  planId: string;
  startDate?: string | null;
  endDate?: string | null;
  price?: number | null;
  discount?: number | null;
  notes?: string | null;
}): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("create_membership", {
    p_org_id: input.organizationId,
    p_branch_id: input.branchId,
    p_member_id: input.memberId,
    p_plan_id: input.planId,
    p_start_date: input.startDate ?? null,
    p_end_date: input.endDate ?? null,
    p_price: input.price ?? null,
    p_discount: input.discount ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

export async function extendMembership(
  membershipId: string,
  days: number,
  notes?: string | null,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("extend_membership", {
    p_membership_id: membershipId,
    p_days: days,
    p_notes: notes ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function renewMembership(input: {
  membershipId: string;
  planId?: string | null;
  startDate?: string | null;
  price?: number | null;
  discount?: number | null;
  notes?: string | null;
}): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("renew_membership", {
    p_membership_id: input.membershipId,
    p_plan_id: input.planId ?? null,
    p_start_date: input.startDate ?? null,
    p_price: input.price ?? null,
    p_discount: input.discount ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}


export interface ActiveMembershipRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCode: string | null;
  memberId: string;
  memberName: string;
  memberCode: string | null;
  memberPhone: string | null;
  planId: string;
  planName: string;
  planCode: string | null;
  startDate: string;
  endDate: string;
  freezeDaysUsed: number;
  isFrozenCurrently: boolean;
  notes: string | null;

  // Linked Invoice & Financial fields
  invoiceId: string | null;
  invoiceNumber: string | null;
  invoiceStatus: string | null;
  totalPlanAmount: number;
  totalAmountPaid: number;
  amountCredited: number;
  remainingBalance: number;

  // Evaluated statuses
  membershipStatus: "active" | "pending" | "expired" | "frozen" | "cancelled";
  paymentStatus: "paid" | "partially_paid" | "unpaid" | "cancelled" | "manual";
}

export interface ActiveMembershipsSummary {
  totalCount: number;
  activeCount: number;
  partialPaidCount: number;
  expiringCount: number;
  pendingCount: number;
  totalOutstandingBalance: number;
}

export interface FetchActiveMembershipsInput {
  organizationId: string;
  search?: string;
  status?: string;
  branchId?: string;
  planId?: string;
  validity?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchActiveMemberships(input: FetchActiveMembershipsInput): Promise<
  OrgResult<{
    rows: ActiveMembershipRow[];
    total: number;
    summary: ActiveMembershipsSummary;
  }>
> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data: rawMemberships, error } = await supabase
    .from("memberships" as AnyTable)
    .select(
      `id, organization_id, branch_id, member_id, plan_id, status, start_date, end_date, price, discount, final_amount, freeze_days_used, notes, created_at,
      branches(id, name, code),
      gym_members(id, full_name, first_name, last_name, code, phone),
      membership_plans(id, name, code, duration_days, max_freeze_days),
      invoices(id, invoice_number, status, total, amount_paid, amount_credited, issue_date, due_date),
      membership_freezes(id, start_date, end_date)`,
    )
    .eq("organization_id", input.organizationId)
    .order("end_date" as "created_at", { ascending: false });

  if (error) {
    return { data: null, error: { message: friendlyMessage(error) } };
  }

  const today = new Date().toISOString().split("T")[0];
  const in30Days = new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
  const in7Days = new Date(Date.now() + 7 * 86400000).toISOString().split("T")[0];

  const allRows: ActiveMembershipRow[] = ((rawMemberships ?? []) as unknown as Row[]).map((row) => {
    const rawInvoices = row.invoices;
    const invoiceList = (Array.isArray(rawInvoices) ? rawInvoices : rawInvoices ? [rawInvoices] : []) as Row[];
    // Pick the most relevant linked invoice: active non-void first, latest issue date
    const validInvoices = invoiceList.filter(
      (inv) => asString(inv.status) !== "void" && asString(inv.status) !== "cancelled",
    );
    const invoice = (validInvoices.length > 0 ? validInvoices[validInvoices.length - 1] : invoiceList[0] ?? null) as Row | null;

    const rawFreezes = row.membership_freezes;
    const freezeList = Array.isArray(rawFreezes) ? rawFreezes : rawFreezes ? [rawFreezes] : [];
    const isFrozenCurrently = freezeList.some((f) => {
      const fRow = f as Row;
      const s = asString(fRow.start_date);
      const e = asString(fRow.end_date);
      return s <= today && e >= today;
    });

    const branch = embedRecord(row.branches);
    const member = embedRecord(row.gym_members);
    const plan = embedRecord(row.membership_plans);

    // Calculate balance as invoices.total - invoices.amount_paid - invoices.amount_credited (no payments.status used)
    const invoiceTotal = invoice ? asNumber(invoice.total) : asNumber(row.final_amount);
    const amountPaid = invoice ? asNumber(invoice.amount_paid) : (row.status === "active" ? invoiceTotal : 0);
    const amountCredited = invoice ? asNumber(invoice.amount_credited) : 0;
    const remainingBalance = Math.max(0, invoiceTotal - amountPaid - amountCredited);

    const dbStatus = asString(row.status) || "active";
    const startDate = asString(row.start_date);
    const endDate = asString(row.end_date);

    let membershipStatus: ActiveMembershipRow["membershipStatus"] = "active";
    if (dbStatus === "cancelled") {
      membershipStatus = "cancelled";
    } else if (isFrozenCurrently) {
      membershipStatus = "frozen";
    } else if (dbStatus === "expired" || (endDate < today && dbStatus !== "pending")) {
      membershipStatus = "expired";
    } else if (dbStatus === "pending") {
      membershipStatus = "pending";
    } else {
      membershipStatus = "active";
    }

    let paymentStatus: ActiveMembershipRow["paymentStatus"] = "paid";
    if (!invoice) {
      paymentStatus = "manual";
    } else if (asString(invoice.status) === "void" || asString(invoice.status) === "cancelled") {
      paymentStatus = "cancelled";
    } else if (remainingBalance <= 0) {
      paymentStatus = "paid";
    } else if (amountPaid > 0 || asString(invoice.status) === "partially_paid") {
      paymentStatus = "partially_paid";
    } else {
      paymentStatus = "unpaid";
    }

    return {
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      branchId: asString(row.branch_id),
      branchName: embedName(branch) ?? "Unknown branch",
      branchCode: asNullableString(branch?.code),
      memberId: asString(row.member_id),
      memberName: embedName(member) ?? "Member",
      memberCode: asNullableString(member?.code),
      memberPhone: asNullableString(member?.phone),
      planId: asString(row.plan_id),
      planName: embedName(plan) ?? "Plan",
      planCode: asNullableString(plan?.code),
      startDate,
      endDate,
      freezeDaysUsed: asNumber(row.freeze_days_used),
      isFrozenCurrently,
      notes: asNullableString(row.notes),
      invoiceId: invoice ? asNullableString(invoice.id) : null,
      invoiceNumber: invoice ? asNullableString(invoice.invoice_number) : null,
      invoiceStatus: invoice ? asNullableString(invoice.status) : null,
      totalPlanAmount: invoiceTotal,
      totalAmountPaid: amountPaid,
      amountCredited,
      remainingBalance,
      membershipStatus,
      paymentStatus,
    };
  });

  // Ensure one membership appears only once even if multiple linked invoices exist
  const seenMembershipIds = new Set<string>();
  const deduplicatedRows: ActiveMembershipRow[] = [];
  for (const r of allRows) {
    if (!seenMembershipIds.has(r.id)) {
      seenMembershipIds.add(r.id);
      deduplicatedRows.push(r);
    }
  }

  const summary: ActiveMembershipsSummary = {
    totalCount: deduplicatedRows.length,
    activeCount: deduplicatedRows.filter((r) => r.membershipStatus === "active").length,
    partialPaidCount: deduplicatedRows.filter((r) => r.paymentStatus === "partially_paid").length,
    expiringCount: deduplicatedRows.filter((r) => r.membershipStatus === "active" && r.endDate >= today && r.endDate <= in30Days).length,
    pendingCount: deduplicatedRows.filter((r) => r.membershipStatus === "pending" || r.paymentStatus === "unpaid").length,
    totalOutstandingBalance: deduplicatedRows.reduce((acc, r) => acc + r.remainingBalance, 0),
  };

  let filtered = deduplicatedRows;

  // Branch filter
  if (input.branchId && input.branchId !== "all") {
    filtered = filtered.filter((r) => r.branchId === input.branchId);
  }

  // Plan filter
  if (input.planId && input.planId !== "all") {
    filtered = filtered.filter((r) => r.planId === input.planId);
  }

  // Status filter (supports both fully paid active memberships AND partially paid pending memberships)
  const filterStatus = input.status ?? "all";
  switch (filterStatus) {
    case "all":
    case "all_active":
      // Default view: Show both fully paid active memberships AND partially paid pending memberships
      filtered = filtered.filter(
        (r) =>
          r.membershipStatus === "active" ||
          (r.membershipStatus === "pending" && (r.paymentStatus === "partially_paid" || r.invoiceStatus === "partially_paid")),
      );
      break;
    case "paid":
      filtered = filtered.filter((r) => r.paymentStatus === "paid" || r.paymentStatus === "manual");
      break;
    case "partial_paid":
      filtered = filtered.filter((r) => r.paymentStatus === "partially_paid");
      break;
    case "expiring":
      filtered = filtered.filter(
        (r) => r.membershipStatus === "active" && r.endDate >= today && r.endDate <= in30Days,
      );
      break;
    case "expired":
      filtered = filtered.filter((r) => r.membershipStatus === "expired" || r.endDate < today);
      break;
    case "pending":
      filtered = filtered.filter((r) => r.membershipStatus === "pending");
      break;
    case "frozen":
      filtered = filtered.filter((r) => r.membershipStatus === "frozen");
      break;
    case "cancelled":
      filtered = filtered.filter((r) => r.membershipStatus === "cancelled");
      break;
    case "all_records":
      // Shows every record without default filter
      break;
  }

  // Validity filter
  if (input.validity && input.validity !== "all") {
    switch (input.validity) {
      case "current":
        filtered = filtered.filter((r) => r.endDate >= today && r.membershipStatus !== "cancelled");
        break;
      case "expiring_7":
        filtered = filtered.filter((r) => r.endDate >= today && r.endDate <= in7Days && r.membershipStatus !== "cancelled");
        break;
      case "expiring_30":
        filtered = filtered.filter((r) => r.endDate >= today && r.endDate <= in30Days && r.membershipStatus !== "cancelled");
        break;
      case "expired":
        filtered = filtered.filter((r) => r.endDate < today || r.membershipStatus === "expired");
        break;
    }
  }

  // Search filter
  if (input.search && input.search.trim()) {
    const q = input.search.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        r.memberName.toLowerCase().includes(q) ||
        (r.memberCode && r.memberCode.toLowerCase().includes(q)) ||
        (r.memberPhone && r.memberPhone.includes(q)) ||
        r.planName.toLowerCase().includes(q) ||
        (r.invoiceNumber && r.invoiceNumber.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q)),
    );
  }

  const page = input.page ?? 1;
  const pageSize = input.pageSize ?? 20;
  const total = filtered.length;
  const startIdx = (page - 1) * pageSize;
  const rows = filtered.slice(startIdx, startIdx + pageSize);

  return {
    data: {
      rows,
      total,
      summary,
    },
    error: null,
  };
}

export async function linkInvoiceMembership(
  invoiceId: string,
  membershipId: string,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  // Try RPC first
  const { error: rpcErr } = await (supabase.rpc as any)("link_invoice_membership", {
    p_invoice_id: invoiceId,
    p_membership_id: membershipId,
  });
  if (!rpcErr) return { data: undefined, error: null };

  // Fallback to direct update
  const { error } = await supabase
    .from("invoices" as AnyTable)
    .update({ membership_id: membershipId } as any)
    .eq("id", invoiceId);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function cancelMembership(
  membershipId: string,
  reason?: string | null,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase
    .from("memberships" as AnyTable)
    .update({
      status: "cancelled",
      notes: reason ? `Cancelled: ${reason}` : "Cancelled by owner",
      updated_at: new Date().toISOString(),
    } as any)
    .eq("id", membershipId);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function createComplimentaryMembership(input: {
  organizationId: string;
  branchId: string;
  memberId: string;
  planId: string;
  startDate?: string | null;
  endDate?: string | null;
  reason: string;
}): Promise<OrgResult<{ id: string }>> {
  if (!input.reason.trim()) {
    return { data: null, error: { message: "An audit reason is required for complimentary membership assignment." } };
  }
  return createMembership({
    organizationId: input.organizationId,
    branchId: input.branchId,
    memberId: input.memberId,
    planId: input.planId,
    startDate: input.startDate,
    endDate: input.endDate,
    price: 0,
    discount: 0,
    notes: `Complimentary ($0) membership. Reason: ${input.reason.trim()}`,
  });
}
