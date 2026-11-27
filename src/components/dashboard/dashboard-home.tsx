"use client";

import * as React from "react";

import { GreetingBanner } from "@/components/dashboard/greeting-banner";
import { KpiGrid } from "@/components/dashboard/kpi-grid";
import { RevenueOverview } from "@/components/dashboard/revenue-overview";
import { MembershipOverview } from "@/components/dashboard/membership-overview";
import { AttendanceOverview } from "@/components/dashboard/attendance-overview";
import { RecentPayments } from "@/components/dashboard/recent-payments";
import { RecentMembers } from "@/components/dashboard/recent-members";
import { UpcomingExpiry } from "@/components/dashboard/upcoming-expiry";
import { UpcomingClasses } from "@/components/dashboard/upcoming-classes";
import { LowStockAlerts } from "@/components/dashboard/low-stock";
import { MemberHome, TrainerHome } from "@/components/dashboard/role-home";
import { useOrganization } from "@/components/auth/org-provider";

export function DashboardHome() {
  const { hasRole } = useOrganization();
  const [cookiePortal, setCookiePortal] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.split("; ").find((row) => row.startsWith("bsb_portal="));
      if (match) setCookiePortal(decodeURIComponent(match.split("=")[1]));
    }
  }, []);

  if (hasRole(["trainer"]) || cookiePortal === "trainer") {
    return <TrainerHome />;
  }

  if (hasRole(["member"]) || cookiePortal === "member") {
    return <MemberHome />;
  }

  return (
    <div className="space-y-6">
      <GreetingBanner />

      <KpiGrid />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RevenueOverview className="lg:col-span-2" />
        <MembershipOverview />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AttendanceOverview className="lg:col-span-2" />
        <UpcomingClasses />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RecentPayments className="lg:col-span-2" />
        <LowStockAlerts />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <RecentMembers className="lg:col-span-2" />
        <UpcomingExpiry />
      </div>
    </div>
  );
}
