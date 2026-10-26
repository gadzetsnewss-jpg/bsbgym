/**
 * Phase 9 report reads. Every query is org-scoped through RLS.
 * Money figures reuse `computeFinanceDashboard`; they are not reimplemented.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import { fetchFinanceDashboard } from "@/lib/finance/client";
import { fetchCrmPipelineCounts } from "@/lib/crm/client";
import { fetchStockOverview } from "@/lib/inventory/client";
import type { OrgResult } from "@/lib/org/members";
import type { FinanceDashboard } from "@/lib/finance/types";
import type { CrmPipelineCounts } from "@/lib/crm/client";
import { buildReportsOverview } from "@/lib/reports/compute";
import type {
  AttendanceReportRow,
  MemberReportRow,
  MembershipReportRow,
  PosReportRow,
  ReportScope,
  ReportsOverview,
  StockReportRow,
} from "@/lib/reports/types";

type AnyTable = "gym_members";
type Row = Record<string, unknown>;

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

function embedName(value: unknown): string {
  const record = embed(value);
  if (!record) return "—";
  if (record.full_name) return asString(record.full_name);
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (record.name && record.code) return `${asString(record.name)} (${asString(record.code)})`;
  return asString(record.name) || "—";
}

function applyBranch<T extends { eq: (column: string, value: string) => T }>(
  query: T,
  branchId?: string,
): T {
  if (branchId && branchId !== "all") return query.eq("branch_id" as "id", branchId);
  return query;
}

export async function fetchMemberReportRows(
  scope: ReportScope,
): Promise<OrgResult<MemberReportRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("gym_members")
    .select(
      "id, code, full_name, first_name, last_name, status, joined_at, phone, branches!gym_members_branch_id_fkey(id, name, code)",
    )
    .eq("organization_id", scope.organizationId)
    .order("joined_at", { ascending: false })
    .limit(2000);
  query = applyBranch(query, scope.branchId);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      code: asString(row.code),
      fullName:
        asNullableString(row.full_name) ||
        [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(" ").trim() ||
        "Member",
      status: asString(row.status) || "active",
      branchName: embedName(row.branches),
      joinedAt: asString(row.joined_at),
      phone: asString(row.phone),
    })),
    error: null,
  };
}

export async function fetchMembershipReportRows(
  scope: ReportScope,
): Promise<OrgResult<MembershipReportRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("memberships" as AnyTable)
    .select(
      "id, member_id, status, start_date, end_date, freeze_days_used, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code), membership_plans(id, name, code)",
    )
    .eq("organization_id", scope.organizationId)
    .order("end_date" as "created_at", { ascending: true })
    .limit(2000);
  query = applyBranch(query, scope.branchId);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      memberId: asString(row.member_id),
      memberName: embedName(row.gym_members),
      planName: embedName(row.membership_plans),
      status: asString(row.status) || "active",
      branchName: embedName(row.branches),
      startDate: asString(row.start_date),
      endDate: asString(row.end_date),
      freezeDaysUsed: asNumber(row.freeze_days_used),
    })),
    error: null,
  };
}

export async function fetchOpenFreezeCount(scope: ReportScope): Promise<OrgResult<number>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = new Date().toISOString().slice(0, 10);
  const { count, error } = await supabase
    .from("membership_freezes" as AnyTable)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", scope.organizationId)
    .lte("start_date" as "id", today)
    .gte("end_date" as "id", today);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: count ?? 0, error: null };
}

export async function fetchAttendanceReportRows(
  scope: ReportScope,
): Promise<OrgResult<AttendanceReportRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("attendance_records" as AnyTable)
    .select(
      "id, check_in_at, check_out_at, method, branches(id, name, code), gym_members(full_name, first_name, last_name, code)",
    )
    .eq("organization_id", scope.organizationId)
    .order("check_in_at" as "created_at", { ascending: false })
    .limit(2000);
  query = applyBranch(query, scope.branchId);
  if (scope.from) query = query.gte("check_in_at" as "created_at", `${scope.from}T00:00:00`);
  if (scope.to) query = query.lte("check_in_at" as "created_at", `${scope.to}T23:59:59`);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      memberName: embedName(row.gym_members),
      branchName: embedName(row.branches),
      checkInAt: asString(row.check_in_at),
      checkOutAt: asNullableString(row.check_out_at),
      method: asString(row.method) || "manual",
    })),
    error: null,
  };
}

export async function fetchPosReportRows(
  scope: ReportScope,
): Promise<OrgResult<PosReportRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  let query = supabase
    .from("pos_sales" as AnyTable)
    .select("id, sale_number, status, total, payment_method, sold_at, branches(id, name, code)")
    .eq("organization_id", scope.organizationId)
    .eq("status" as "id", "completed")
    .order("sold_at" as "created_at", { ascending: false })
    .limit(2000);
  query = applyBranch(query, scope.branchId);
  if (scope.from) query = query.gte("sold_at" as "created_at", `${scope.from}T00:00:00`);
  if (scope.to) query = query.lte("sold_at" as "created_at", `${scope.to}T23:59:59`);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      saleNumber: asString(row.sale_number),
      branchName: embedName(row.branches),
      status: asString(row.status) || "completed",
      total: asNumber(row.total),
      paymentMethod: asString(row.payment_method) || "cash",
      soldAt: asString(row.sold_at),
    })),
    error: null,
  };
}

export async function fetchStockReportRows(
  organizationId: string,
): Promise<OrgResult<StockReportRow[]>> {
  const result = await fetchStockOverview(organizationId);
  if (result.error) return { data: null, error: result.error };
  return {
    data: result.data.map((row) => ({
      productId: row.productId,
      name: row.name,
      sku: row.sku,
      unit: row.unit,
      stockQuantity: row.stockQuantity,
      reorderLevel: row.reorderLevel,
      stockValue: row.stockValue,
      isLow: row.isLow,
    })),
    error: null,
  };
}

export async function fetchReportsOverview(
  scope: ReportScope,
): Promise<
  OrgResult<{
    overview: ReportsOverview;
    finance: FinanceDashboard;
    crm: CrmPipelineCounts;
  }>
> {
  const [members, memberships, freezes, attendance, stock, finance, crm] = await Promise.all([
    fetchMemberReportRows(scope),
    fetchMembershipReportRows(scope),
    fetchOpenFreezeCount(scope),
    fetchAttendanceReportRows(scope),
    fetchStockReportRows(scope.organizationId),
    fetchFinanceDashboard({
      organizationId: scope.organizationId,
      branchId: scope.branchId,
      from: scope.from,
      to: scope.to,
    }),
    fetchCrmPipelineCounts(scope.organizationId),
  ]);
  const error =
    members.error ??
    memberships.error ??
    freezes.error ??
    attendance.error ??
    stock.error ??
    finance.error ??
    crm.error;
  if (error) return { data: null, error };
  return {
    data: {
      overview: buildReportsOverview({
        members: members.data ?? [],
        memberships: memberships.data ?? [],
        freezeWindowsOpen: freezes.data ?? 0,
        finance: finance.data!,
        crm: crm.data!,
        attendanceInRange: attendance.data?.length ?? 0,
        stock: stock.data ?? [],
        from: scope.from,
        to: scope.to,
      }),
      finance: finance.data!,
      crm: crm.data!,
    },
    error: null,
  };
}
