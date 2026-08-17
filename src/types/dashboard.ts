/**
 * Dashboard data contracts (Phase 0).
 *
 * These types describe the shape of dashboard data so a future Supabase data
 * source (a service/repository) can return the same shapes without any
 * component changes.
 */

export type Trend = "up" | "down" | "flat";

export interface KpiMetric {
  id: string;
  label: string;
  value: string;
  /** Percentage change vs previous period. */
  delta?: number;
  trend?: Trend;
  /** Direction considered "good" for this metric (defaults to "up"). */
  trendGoodDirection?: "up" | "down";
  /** Supporting copy, e.g. "128 invoices" or "next 30 days". */
  hint?: string;
}

export interface MultiSeriesChart {
  labels: readonly string[];
  series: readonly {
    name: string;
    color: string;
    data: readonly number[];
  }[];
}

export interface PaymentMethod {
  id: string;
  invoice: string;
  member: string;
  plan: string;
  amount: string;
  method: string;
  status: string;
  date: string;
}

export interface MemberRow {
  id: string;
  name: string;
  plan: string;
  trainer: string;
  joinedOn: string;
  status: string;
}

export interface ExpiryItem {
  id: string;
  name: string;
  plan: string;
  expiresOn: string;
  daysLeft: number;
}

export interface QuickAction {
  id: string;
  label: string;
  href: string;
}

/* ---------------------------------------------------------------------------
   Phase 0.2 dashboard sections
   --------------------------------------------------------------------------- */

export type RevenuePeriod = "7d" | "30d" | "12m";

export interface RevenueDataset {
  period: RevenuePeriod;
  label: string;
  labels: readonly string[];
  series: readonly {
    name: string;
    color: string;
    data: readonly number[];
  }[];
}

export interface MembershipOverviewStats {
  active: number;
  expiring: number;
  frozen: number;
  expired: number;
}

export interface AttendanceToday {
  checkedIn: number;
  target: number;
  inGymNow: number;
  peakLabel: string;
}

export interface UpcomingClass {
  id: string;
  name: string;
  trainer: string;
  time: string;
  duration: string;
  capacity: number;
  booked: number;
}

export interface LowStockItem {
  id: string;
  product: string;
  sku: string;
  current: number;
  minimum: number;
  unit: string;
}

export interface AttendanceOverviewData {
  today: AttendanceToday;
  weekly: MultiSeriesChart;
  peakHours: MultiSeriesChart;
}
