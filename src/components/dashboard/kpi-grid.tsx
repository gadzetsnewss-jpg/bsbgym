"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarCheck, Clock, Hourglass, Target, Users } from "lucide-react";
import { KpiCard, type KpiTone } from "@/components/dashboard/kpi-card";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchDashboardKpis } from "@/lib/dashboard/client";
import type { KpiMetric } from "@/types/dashboard";

const ICON_MAP: Record<string, { icon: LucideIcon; tone: KpiTone }> = {
  "active-members": { icon: Users, tone: "default" },
  "todays-attendance": { icon: CalendarCheck, tone: "default" },
  "todays-revenue": { icon: Banknote, tone: "default" },
  "outstanding-dues": { icon: Hourglass, tone: "warning" },
  expiring: { icon: Clock, tone: "warning" },
  "new-leads": { icon: Target, tone: "accent" },
};

const FALLBACK = { icon: Users, tone: "default" as const };

export function KpiGrid() {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const { formatMoney } = useFinanceSettings();
  const [metrics, setMetrics] = React.useState<KpiMetric[]>([]);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void fetchDashboardKpis(orgId).then((result) => {
      if (cancelled || result.error) {
        if (!cancelled) {
          setMetrics([
            { id: "active-members", label: "Active Members", value: "—" },
            { id: "todays-attendance", label: "Today's Attendance", value: "—" },
            { id: "todays-revenue", label: "Today's collections", value: "—" },
            { id: "outstanding-dues", label: "Outstanding Dues", value: "—" },
            { id: "expiring", label: "Expiring Memberships", value: "—" },
            { id: "new-leads", label: "New Leads", value: "—" },
          ]);
        }
        return;
      }
      const data = result.data;
      const canFinance = can("finance.view") || can("billing.view") || can("payments.view");
      const canCrm = can("crm.view");
      const next: KpiMetric[] = [
        {
          id: "active-members",
          label: "Active Members",
          value: data.activeMembers.toLocaleString(),
          hint: "Member profiles with status active",
        },
        {
          id: "todays-attendance",
          label: "Today's Attendance",
          value: data.todaysAttendance.toLocaleString(),
          hint: "Check-ins today",
        },
      ];
      if (canFinance) {
        next.push({
          id: "todays-revenue",
          label: "Today's collections",
          value: formatMoney(data.todaysCollected),
          hint: "Invoice payments + POS + other income",
        });
        next.push({
          id: "outstanding-dues",
          label: "Outstanding Dues",
          value: formatMoney(data.outstanding),
          hint: "Unpaid invoice remainder",
        });
      }
      next.push({
        id: "expiring",
        label: "Expiring Memberships",
        value: data.expiringMemberships.toLocaleString(),
        hint: "Active memberships ending in 30 days",
      });
      if (canCrm) {
        next.push({
          id: "new-leads",
          label: "New Leads",
          value: data.newLeads.toLocaleString(),
          hint: "Leads in status new",
        });
      }
      setMetrics(next);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, can, formatMoney]);

  if (metrics.length === 0) {
    return (
      <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-28 animate-pulse rounded-card border border-border bg-surface" />
        ))}
      </section>
    );
  }

  return (
    <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {metrics.map((metric) => {
        const { icon, tone } = ICON_MAP[metric.id] ?? FALLBACK;
        return <KpiCard key={metric.id} metric={metric} icon={icon} tone={tone} />;
      })}
    </section>
  );
}
