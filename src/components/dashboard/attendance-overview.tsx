"use client";

import * as React from "react";
import { Clock, Target, UserCheck } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { BarChart } from "@/components/ui/chart";
import { Tabs } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchAttendanceOverview } from "@/lib/dashboard/client";
import type { AttendanceOverviewData } from "@/types/dashboard";

type AttendanceTab = "today" | "weekly" | "peak";

const TABS = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "peak", label: "Peak Hours" },
];

export function AttendanceOverview({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("attendance.view") || can("dashboard.view");

  const [tab, setTab] = React.useState<AttendanceTab>("today");
  const [data, setData] = React.useState<AttendanceOverviewData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchAttendanceOverview(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setData(result.data);
  }, [orgId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const checkedRatio = data
    ? Math.min(data.today.checkedIn / Math.max(data.today.target, 1), 1)
    : 0;

  return (
    <ChartCard
      title="Attendance Overview"
      description="Check-ins across your branches"
      className={className}
      headerExtra={
        <Tabs
          items={TABS}
          value={tab}
          onValueChange={(value) => setTab(value as AttendanceTab)}
          aria-label="Attendance view"
          variant="pills"
          className="w-auto"
        />
      }
    >
      {!canView ? (
        <EmptyState title="Attendance is restricted" description="You do not have permission to view attendance." />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !data ? (
        <LoadingState label="Loading attendance…" />
      ) : tab === "today" ? (
        <div>
          <div className="grid grid-cols-3 gap-3">
            {[
              { id: "checked-in", label: "Checked in", value: data.today.checkedIn.toLocaleString(), icon: UserCheck },
              { id: "target", label: "Daily target", value: data.today.target.toLocaleString(), icon: Target },
              { id: "in-gym", label: "In gym right now", value: data.today.inGymNow.toLocaleString(), icon: Clock },
            ].map((tile) => {
              const Icon = tile.icon;
              return (
                <div key={tile.id} className="rounded-lg border border-border bg-surface-muted p-3">
                  <div className="flex items-center gap-1.5 text-neutral-500">
                    <Icon aria-hidden="true" className="size-3.5" />
                    <span className="text-[11px] font-medium tracking-wide uppercase">{tile.label}</span>
                  </div>
                  <p className="mt-1.5 text-xl font-semibold text-ink">{tile.value}</p>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Check-in progress</span>
              <span className="font-medium text-ink">{Math.round(checkedRatio * 100)}%</span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(checkedRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Check-in progress"
              className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"
            >
              <div className="h-full rounded-full bg-brand-gradient" style={{ width: `${checkedRatio * 100}%` }} />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Peak footfall today: <span className="font-medium text-ink">{data.today.peakLabel}</span>
            </p>
          </div>
        </div>
      ) : tab === "weekly" ? (
        <BarChart labels={data.weekly.labels} data={data.weekly.series[0]?.data ?? []} height={210} />
      ) : (
        <BarChart labels={data.peakHours.labels} data={data.peakHours.series[0]?.data ?? []} height={210} />
      )}
    </ChartCard>
  );
}
