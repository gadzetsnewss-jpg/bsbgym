/**
 * Org-scoped dashboard reads (Phase 4 + Phase 9).
 *
 * Attendance, classes, members, memberships, collections, stock and CRM
 * counts are live. Collected cash reuses finance dashboard math and is
 * never invoice totals.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import type {
  AttendanceOverviewData,
  ExpiryItem,
  LowStockItem,
  MemberRow,
  MembershipOverviewStats,
  PaymentMethod,
  RevenueDataset,
  RevenuePeriod,
  UpcomingClass,
} from "@/types/dashboard";
import { fetchFinanceDashboard, fetchFinanceSnapshot } from "@/lib/finance/client";
import { fetchCrmPipelineCounts } from "@/lib/crm/client";
import { fetchStockOverview } from "@/lib/inventory/client";
import { remainingDaysFromToday } from "@/lib/operations/freeze";
import { formatCurrencyWithDecimals, formatDatePattern } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { roundMoney } from "@/lib/billing/gst";

type AnyTable = "gym_members";
type Row = Record<string, unknown>;

function utcDayBounds(daysAgo = 0): { start: string; end: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function embedName(value: unknown): string {
  if (!value) return "—";
  const record = (Array.isArray(value) ? value[0] : value) as
    | { name?: string; full_name?: string; first_name?: string; last_name?: string }
    | null;
  if (!record) return "—";
  if (record.full_name) return record.full_name;
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return record.name ?? "—";
}

function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

function hourLabel(iso: string): string {
  const hour = new Date(iso).getUTCHours();
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

export async function fetchAttendanceOverview(
  organizationId: string,
): Promise<OrgResult<AttendanceOverviewData>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const today = utcDayBounds(0);
  const weekStart = utcDayBounds(6).start;

  const [{ data, error }, memberCount] = await Promise.all([
    supabase
      .from("attendance_records" as AnyTable)
      .select("id, check_in_at, check_out_at")
      .eq("organization_id", organizationId)
      .gte("check_in_at" as "created_at", weekStart)
      .lt("check_in_at" as "created_at", today.end)
      .order("check_in_at" as "created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("gym_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (memberCount.error) return { data: null, error: { message: friendlyMessage(memberCount.error) } };

  const rows = (data ?? []) as unknown as Row[];
  const activeMembers = memberCount.count ?? 0;
  const todayRows = rows.filter((row) => {
    const at = String(row.check_in_at ?? "");
    return at >= today.start && at < today.end;
  });
  const inGymNow = todayRows.filter((row) => !row.check_out_at).length;

  const weeklyCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    const bounds = utcDayBounds(i);
    weeklyCounts.set(weekdayLabel(bounds.start), 0);
  }
  const peakCounts = new Map<string, number>();

  for (const row of rows) {
    const at = String(row.check_in_at ?? "");
    if (!at) continue;
    const day = weekdayLabel(at);
    if (weeklyCounts.has(day)) weeklyCounts.set(day, (weeklyCounts.get(day) ?? 0) + 1);
    if (at >= today.start && at < today.end) {
      const hour = hourLabel(at);
      peakCounts.set(hour, (peakCounts.get(hour) ?? 0) + 1);
    }
  }

  let peakLabel = "—";
  let peakValue = 0;
  for (const [label, count] of peakCounts) {
    if (count > peakValue) {
      peakValue = count;
      peakLabel = label;
    }
  }

  const weeklyLabels = [...weeklyCounts.keys()];
  const peakLabels = [...peakCounts.keys()];
  if (peakLabels.length === 0) peakLabels.push("—");

  return {
    data: {
      today: {
        checkedIn: todayRows.length,
        target: Math.max(activeMembers, todayRows.length, 0),
        inGymNow,
        peakLabel: peakValue > 0 ? peakLabel : "—",
      },
      weekly: {
        labels: weeklyLabels,
        series: [{ name: "Check-ins", color: "#0d9488", data: weeklyLabels.map((label) => weeklyCounts.get(label) ?? 0) }],
      },
      peakHours: {
        labels: peakLabels,
        series: [
          {
            name: "Check-ins",
            color: "#0d9488",
            data: peakLabels.map((label) => peakCounts.get(label) ?? 0),
          },
        ],
      },
    },
    error: null,
  };
}

export async function fetchUpcomingClasses(
  organizationId: string,
): Promise<OrgResult<UpcomingClass[]>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("class_sessions" as AnyTable)
    .select(
      "id, starts_at, ends_at, capacity, status, class_templates(name), trainers(full_name, first_name, last_name), class_bookings(id, status)",
    )
    .eq("organization_id", organizationId)
    .eq("status" as "id", "scheduled")
    .gte("starts_at" as "created_at", now)
    .order("starts_at" as "created_at", { ascending: true })
    .limit(8);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => {
      const starts = String(row.starts_at ?? "");
      const ends = String(row.ends_at ?? "");
      const startDate = starts ? new Date(starts) : null;
      const endDate = ends ? new Date(ends) : null;
      const durationMin =
        startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())
          ? Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 60000), 0)
          : 0;
      const bookings = Array.isArray(row.class_bookings) ? row.class_bookings : [];
      const booked = bookings.filter((booking) => {
        const status = String((booking as Row).status ?? "");
        return status === "booked" || status === "attended";
      }).length;
      return {
        id: String(row.id),
        name: embedName(row.class_templates),
        trainer: embedName(row.trainers),
        time: startDate && !Number.isNaN(startDate.getTime())
          ? startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—",
        duration: durationMin > 0 ? `${durationMin} min` : "—",
        capacity: typeof row.capacity === "number" ? row.capacity : Number(row.capacity) || 0,
        booked,
      };
    }),
    error: null,
  };
}

export async function fetchTodaysAttendanceCount(
  organizationId: string,
): Promise<OrgResult<number>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = utcDayBounds(0);
  const { count, error } = await supabase
    .from("attendance_records" as AnyTable)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("check_in_at" as "created_at", today.start)
    .lt("check_in_at" as "created_at", today.end);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: count ?? 0, error: null };
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function isoDay(daysAgo: number): string {
  const date = new Date();
  date.setUTCHours(0, 0, 0, 0);
  date.setUTCDate(date.getUTCDate() - daysAgo);
  return date.toISOString().slice(0, 10);
}

export interface DashboardKpiData {
  activeMembers: number;
  todaysAttendance: number;
  todaysCollected: number;
  outstanding: number;
  outstandingInvoices: number;
  expiringMemberships: number;
  newLeads: number;
}

export async function fetchDashboardKpis(
  organizationId: string,
): Promise<OrgResult<DashboardKpiData>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const today = new Date().toISOString().slice(0, 10);
  const expiryLimit = new Date(`${today}T00:00:00`);
  expiryLimit.setDate(expiryLimit.getDate() + 30);
  const until = expiryLimit.toISOString().slice(0, 10);

  const [members, attendance, finance, memberships, crm] = await Promise.all([
    supabase
      .from("gym_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    fetchTodaysAttendanceCount(organizationId),
    fetchFinanceDashboard({ organizationId, from: today, to: today }),
    supabase
      .from("memberships" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .gte("end_date" as "created_at", today)
      .lte("end_date" as "created_at", until),
    fetchCrmPipelineCounts(organizationId),
  ]);

  if (members.error) return { data: null, error: { message: friendlyMessage(members.error) } };
  if (attendance.error) return { data: null, error: attendance.error };
  if (finance.error) return { data: null, error: finance.error };
  if (memberships.error) return { data: null, error: { message: friendlyMessage(memberships.error) } };
  if (crm.error) return { data: null, error: crm.error };

  const outstandingSnapshot = await fetchFinanceDashboard({ organizationId });
  if (outstandingSnapshot.error) return { data: null, error: outstandingSnapshot.error };

  return {
    data: {
      activeMembers: members.count ?? 0,
      todaysAttendance: attendance.data ?? 0,
      todaysCollected: finance.data.collectedTotal,
      outstanding: outstandingSnapshot.data.outstanding,
      outstandingInvoices: outstandingSnapshot.data.invoiceCount,
      expiringMemberships: memberships.count ?? 0,
      newLeads: crm.data.newLeads,
    },
    error: null,
  };
}

export async function fetchMembershipOverviewStats(
  organizationId: string,
): Promise<OrgResult<MembershipOverviewStats>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = new Date().toISOString().slice(0, 10);
  const expiryLimit = new Date(`${today}T00:00:00`);
  expiryLimit.setDate(expiryLimit.getDate() + 30);
  const until = expiryLimit.toISOString().slice(0, 10);

  const [active, expired, expiring, freezes] = await Promise.all([
    supabase
      .from("memberships" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("memberships" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status" as "id", "expired"),
    supabase
      .from("memberships" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .gte("end_date" as "created_at", today)
      .lte("end_date" as "created_at", until),
    supabase
      .from("membership_freezes" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .lte("start_date" as "id", today)
      .gte("end_date" as "id", today),
  ]);

  const error = active.error ?? expired.error ?? expiring.error ?? freezes.error;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: {
      active: active.count ?? 0,
      expiring: expiring.count ?? 0,
      frozen: freezes.count ?? 0,
      expired: expired.count ?? 0,
    },
    error: null,
  };
}

export async function fetchRecentPaymentsLive(
  organizationId: string,
  currency = "INR",
  dateFormat = "DD/MM/YYYY",
  decimalPlaces = 2,
): Promise<OrgResult<PaymentMethod[]>> {
  const result = await fetchFinanceSnapshot({ organizationId });
  if (result.error) return { data: null, error: result.error };
  return {
    data: result.data.payments.slice(0, 8).map((row) => ({
      id: row.id,
      invoice: row.invoiceNumber ?? "Invoice payment",
      member: row.memberName ?? "Member",
      plan: "",
      amount: formatCurrencyWithDecimals(row.amount, currency, decimalPlaces),
      method: PAYMENT_METHOD_LABELS[row.method] ?? row.method,
      status: "Paid",
      date: formatDatePattern(row.paidAt, dateFormat),
    })),
    error: null,
  };
}

export async function fetchRecentMembersLive(
  organizationId: string,
  dateFormat = "DD/MM/YYYY",
): Promise<OrgResult<MemberRow[]>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("gym_members")
    .select(
      "id, full_name, first_name, last_name, status, joined_at, trainers!gym_members_assigned_trainer_fkey(full_name, first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .order("joined_at", { ascending: false })
    .limit(8);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      name:
        asString(row.full_name).trim() ||
        [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(" ").trim() ||
        "Member",
      plan: "—",
      trainer: embedName(row.trainers),
      joinedOn: formatDatePattern(asString(row.joined_at), dateFormat),
      status: asString(row.status) || "active",
    })),
    error: null,
  };
}

export async function fetchUpcomingExpiryLive(
  organizationId: string,
  dateFormat = "DD/MM/YYYY",
): Promise<OrgResult<ExpiryItem[]>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = new Date().toISOString().slice(0, 10);
  const limit = new Date(`${today}T00:00:00`);
  limit.setDate(limit.getDate() + 30);
  const until = limit.toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("memberships" as AnyTable)
    .select(
      "id, end_date, gym_members(full_name, first_name, last_name, code), membership_plans(name, code)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .gte("end_date" as "created_at", today)
    .lte("end_date" as "created_at", until)
    .order("end_date" as "created_at", { ascending: true })
    .limit(8);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => {
      const end = asString(row.end_date);
      return {
        id: asString(row.id),
        name: embedName(row.gym_members),
        plan: embedName(row.membership_plans),
        expiresOn: formatDatePattern(end, dateFormat),
        daysLeft: remainingDaysFromToday(end, today),
      };
    }),
    error: null,
  };
}

export async function fetchLowStockLive(
  organizationId: string,
): Promise<OrgResult<LowStockItem[]>> {
  const result = await fetchStockOverview(organizationId);
  if (result.error) return { data: null, error: result.error };
  return {
    data: result.data
      .filter((row) => row.isLow)
      .slice(0, 8)
      .map((row) => ({
        id: row.productId,
        product: row.name,
        sku: row.sku ?? "—",
        current: row.stockQuantity,
        minimum: row.reorderLevel,
        unit: row.unit,
      })),
    error: null,
  };
}

function weekdayShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    weekday: "short",
    timeZone: "UTC",
  });
}

function monthShort(iso: string): string {
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-GB", {
    month: "short",
    timeZone: "UTC",
  });
}

export async function fetchRevenueOverviewLive(
  organizationId: string,
  period: RevenuePeriod,
): Promise<OrgResult<RevenueDataset>> {
  const days = period === "7d" ? 6 : period === "30d" ? 29 : 364;
  const from = isoDay(days);
  const to = isoDay(0);
  const snapshot = await fetchFinanceSnapshot({ organizationId, from, to });
  if (snapshot.error) return { data: null, error: snapshot.error };

  const buckets = new Map<string, { billed: number; collected: number }>();
  const labels: string[] = [];

  if (period === "12m") {
    for (let i = 11; i >= 0; i -= 1) {
      const date = new Date();
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - i);
      const key = date.toISOString().slice(0, 7);
      labels.push(monthShort(`${key}-01`));
      buckets.set(key, { billed: 0, collected: 0 });
    }
  } else {
    for (let i = days; i >= 0; i -= 1) {
      const day = isoDay(i);
      labels.push(period === "7d" ? weekdayShort(day) : day.slice(5));
      buckets.set(day, { billed: 0, collected: 0 });
    }
  }

  const bucketKey = (iso: string) => (period === "12m" ? iso.slice(0, 7) : iso.slice(0, 10));

  for (const invoice of snapshot.data.invoices) {
    if (!["issued", "partially_paid", "overdue", "paid"].includes(invoice.status)) continue;
    const key = bucketKey(invoice.issueDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.billed = roundMoney(bucket.billed + invoice.total);
  }
  for (const payment of snapshot.data.payments) {
    const key = bucketKey(payment.paidAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.collected = roundMoney(bucket.collected + payment.amount);
  }
  for (const sale of snapshot.data.posSales) {
    if (sale.status !== "completed") continue;
    const key = bucketKey(sale.soldAt);
    const bucket = buckets.get(key);
    if (bucket) bucket.collected = roundMoney(bucket.collected + sale.total);
  }
  for (const income of snapshot.data.income) {
    const key = bucketKey(income.incomeDate);
    const bucket = buckets.get(key);
    if (bucket) bucket.collected = roundMoney(bucket.collected + income.amount);
  }

  const billed = [...buckets.values()].map((bucket) => bucket.billed);
  const collected = [...buckets.values()].map((bucket) => bucket.collected);

  return {
    data: {
      period,
      label: period === "7d" ? "Last 7 days" : period === "30d" ? "Last 30 days" : "Last 12 months",
      labels,
      series: [
        { name: "Invoiced", color: "var(--color-primary-600)", data: billed },
        { name: "Collected", color: "var(--color-accent-500)", data: collected },
      ],
    },
    error: null,
  };
}
