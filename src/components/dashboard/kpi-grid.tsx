"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Banknote, CalendarCheck, Clock, Hourglass, Target, Users } from "lucide-react";
import { KpiCard, type KpiTone } from "@/components/dashboard/kpi-card";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchTodaysAttendanceCount } from "@/lib/dashboard/client";
import type { KpiMetric } from "@/types/dashboard";

interface KpiGridProps {
  metrics: readonly KpiMetric[];
}

const ICON_MAP: Record<string, { icon: LucideIcon; tone: KpiTone }> = {
  "active-members": { icon: Users, tone: "default" },
  "todays-attendance": { icon: CalendarCheck, tone: "default" },
  "todays-revenue": { icon: Banknote, tone: "default" },
  "outstanding-dues": { icon: Hourglass, tone: "warning" },
  expiring: { icon: Clock, tone: "warning" },
  "new-leads": { icon: Target, tone: "accent" },
};

const FALLBACK = { icon: Users, tone: "default" as const };

export function KpiGrid({ metrics }: KpiGridProps) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [attendance, setAttendance] = React.useState<number | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void fetchTodaysAttendanceCount(orgId).then((result) => {
      if (cancelled || result.error) return;
      setAttendance(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const resolved = metrics.map((metric) => {
    if (metric.id !== "todays-attendance" || attendance === null) return metric;
    return {
      ...metric,
      value: attendance.toLocaleString(),
      hint: "Today",
      delta: undefined,
      trend: undefined,
    };
  });

  return (
    <section aria-label="Key metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {resolved.map((metric) => {
        const { icon, tone } = ICON_MAP[metric.id] ?? FALLBACK;
        return <KpiCard key={metric.id} metric={metric} icon={icon} tone={tone} />;
      })}
    </section>
  );
}
