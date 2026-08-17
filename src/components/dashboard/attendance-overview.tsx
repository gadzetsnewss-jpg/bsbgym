"use client";

import * as React from "react";
import { Clock, Target, UserCheck } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { BarChart } from "@/components/ui/chart";
import { Tabs } from "@/components/ui/tabs";
import { ATTENDANCE_OVERVIEW } from "@/data/mock-dashboard";
import { cn } from "@/lib/utils";

type AttendanceTab = "today" | "weekly" | "peak";

const TABS = [
  { value: "today", label: "Today" },
  { value: "weekly", label: "Weekly" },
  { value: "peak", label: "Peak Hours" },
];

const STAT_TILES = [
  {
    id: "checked-in",
    label: "Checked in",
    value: ATTENDANCE_OVERVIEW.today.checkedIn.toLocaleString(),
    icon: UserCheck,
  },
  {
    id: "target",
    label: "Daily target",
    value: ATTENDANCE_OVERVIEW.today.target.toLocaleString(),
    icon: Target,
  },
  {
    id: "in-gym",
    label: "In gym right now",
    value: ATTENDANCE_OVERVIEW.today.inGymNow.toLocaleString(),
    icon: Clock,
  },
];

export function AttendanceOverview({ className }: { className?: string }) {
  const [tab, setTab] = React.useState<AttendanceTab>("today");

  const checkedRatio = Math.min(
    ATTENDANCE_OVERVIEW.today.checkedIn / ATTENDANCE_OVERVIEW.today.target,
    1,
  );

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
      {tab === "today" && (
        <div>
          <div className="grid grid-cols-3 gap-3">
            {STAT_TILES.map((tile) => {
              const Icon = tile.icon;
              return (
                <div
                  key={tile.id}
                  className="rounded-lg border border-border bg-surface-muted p-3"
                >
                  <div className="flex items-center gap-1.5 text-neutral-500">
                    <Icon aria-hidden="true" className="size-3.5" />
                    <span className="text-[11px] font-medium tracking-wide uppercase">
                      {tile.label}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xl font-semibold text-ink">
                    {tile.value}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between text-sm">
              <span className="text-neutral-500">Check-in progress</span>
              <span className="font-medium text-ink">
                {Math.round(checkedRatio * 100)}%
              </span>
            </div>
            <div
              role="progressbar"
              aria-valuenow={Math.round(checkedRatio * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Check-in progress"
              className="mt-2 h-2 overflow-hidden rounded-full bg-neutral-100"
            >
              <div
                className="h-full rounded-full bg-brand-gradient"
                style={{ width: `${checkedRatio * 100}%` }}
              />
            </div>
            <p className="mt-3 text-xs text-neutral-500">
              Peak footfall today:{" "}
              <span className="font-medium text-ink">
                {ATTENDANCE_OVERVIEW.today.peakLabel}
              </span>
            </p>
          </div>
        </div>
      )}

      {tab === "weekly" && (
        <BarChart
          labels={ATTENDANCE_OVERVIEW.weekly.labels}
          data={ATTENDANCE_OVERVIEW.weekly.series[0]?.data ?? []}
          height={210}
        />
      )}

      {tab === "peak" && (
        <BarChart
          labels={ATTENDANCE_OVERVIEW.peakHours.labels}
          data={ATTENDANCE_OVERVIEW.peakHours.series[0]?.data ?? []}
          height={210}
        />
      )}
    </ChartCard>
  );
}
