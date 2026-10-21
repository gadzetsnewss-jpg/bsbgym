/**
 * Source-level acceptance guards for Phase 9 reports, notifications and dashboard.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const overview = read("src/components/reports/reports-overview.tsx");
const category = read("src/components/reports/category-report.tsx");
const center = read("src/components/notifications/notification-center.tsx");
const bell = read("src/components/layout/notification-bell.tsx");
const kpi = read("src/components/dashboard/kpi-grid.tsx");
const revenue = read("src/components/dashboard/revenue-overview.tsx");
const membership = read("src/components/dashboard/membership-overview.tsx");
const payments = read("src/components/dashboard/recent-payments.tsx");
const members = read("src/components/dashboard/recent-members.tsx");
const expiry = read("src/components/dashboard/upcoming-expiry.tsx");
const stock = read("src/components/dashboard/low-stock.tsx");
const greeting = read("src/components/dashboard/greeting-banner.tsx");
const reportsPage = read("src/app/(app)/reports/page.tsx");
const notificationsPage = read("src/app/(app)/notifications/page.tsx");
const combine = read("COMBINE.sql");
const notifyClient = read("src/lib/notifications/client.ts");
const reportsClient = read("src/lib/reports/client.ts");

describe("Phase 9 routes and screens", () => {
  it("mounts live reports and notification screens instead of placeholders", () => {
    expect(reportsPage).toMatch(/ReportsOverviewScreen/);
    expect(notificationsPage).toMatch(/NotificationCenterScreen/);
    expect(reportsPage).not.toMatch(/ModulePlaceholder/);
    expect(notificationsPage).not.toMatch(/ModulePlaceholder/);
  });

  it("keeps collected cash separate from invoiced totals", () => {
    expect(overview).toMatch(/Invoice payments \+ POS \+ other income/);
    expect(overview).toMatch(/Unpaid invoice remainder/);
    expect(overview).toMatch(/Finance cash movement is not duplicated here/);
    expect(revenue).toMatch(/Collected is payments \+ POS \+ other income, not invoice totals/);
    expect(kpi).toMatch(/Invoice payments \+ POS \+ other income/);
  });

  it("does not claim freeze is a membership status", () => {
    expect(overview).toMatch(/Open freeze windows/);
    expect(membership).toMatch(/Freeze is a timeline window, not a membership status/);
  });

  it("CSV and print only — no fake PDF or Excel", () => {
    expect(overview).toMatch(/Export CSV/);
    expect(overview).toMatch(/window\.print/);
    expect(category).toMatch(/downloadCsvTable/);
    expect(overview).not.toMatch(/PDF|Excel|xlsx/i);
    expect(category).not.toMatch(/PDF|Excel|xlsx/i);
    expect(payments).not.toMatch(/Download PDF/);
  });

  it("notifications are in-app only and opening does not mutate finance", () => {
    expect(center).toMatch(/Email, WhatsApp and SMS are not sent from this screen/);
    expect(center).toMatch(/Scheduled expiry or follow-up jobs are not running/);
    expect(center).toMatch(/safeNotificationHref/);
    expect(center).toMatch(/markNotificationRead/);
    expect(bell).toMatch(/fetchUnreadNotificationCount/);
    expect(bell).not.toMatch(/MOCK_NOTIFICATIONS/);
  });

  it("dashboard widgets use live fetchers instead of mock-dashboard", () => {
    expect(kpi).toMatch(/fetchDashboardKpis/);
    expect(revenue).toMatch(/fetchRevenueOverviewLive/);
    expect(membership).toMatch(/fetchMembershipOverviewStats/);
    expect(payments).toMatch(/fetchRecentPaymentsLive/);
    expect(members).toMatch(/fetchRecentMembersLive/);
    expect(expiry).toMatch(/fetchUpcomingExpiryLive/);
    expect(stock).toMatch(/fetchLowStockLive/);
    expect(greeting).not.toMatch(/CURRENT_USER/);
    expect(kpi).not.toMatch(/mock-dashboard/);
    expect(revenue).not.toMatch(/REVENUE_DATASETS/);
    expect(payments).not.toMatch(/RECENT_PAYMENTS/);
  });

  it("notification writes go through RPCs only", () => {
    expect(notifyClient).toMatch(/mark_notification_read/);
    expect(notifyClient).toMatch(/mark_all_notifications_read/);
    expect(notifyClient).not.toMatch(/\.update\(/);
    expect(notifyClient).not.toMatch(/\.insert\(/);
    expect(notifyClient).not.toMatch(/\.delete\(/);
  });

  it("reports reuse finance dashboard math instead of re-summing invoices as collected", () => {
    expect(reportsClient).toMatch(/fetchFinanceDashboard/);
    expect(reportsClient).not.toMatch(/collectedTotal \+/);
  });

  it("COMBINE.sql includes the Phase 9 notification RPC migration", () => {
    expect(combine).toMatch(/20261020000032_notification_read_rpcs\.sql/);
    expect(combine).toMatch(/create or replace function public\.mark_notification_read\(/);
    expect(combine).toMatch(/create or replace function public\.mark_all_notifications_read\(/);
  });
});
