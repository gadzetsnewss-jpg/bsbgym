"use client";

import * as React from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MultiLineChart } from "@/components/ui/chart";
import { Tabs } from "@/components/ui/tabs";
import { REVENUE_DATASETS } from "@/data/mock-dashboard";
import type { RevenuePeriod } from "@/types/dashboard";

const PERIOD_TABS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
];

function formatRevenue(value: number, period: RevenuePeriod): string {
  if (period === "12m") return `₹${value}L`;
  return `₹${Math.round(value)}k`;
}

export function RevenueOverview({ className }: { className?: string }) {
  const [period, setPeriod] = React.useState<RevenuePeriod>("30d");
  const dataset =
    REVENUE_DATASETS.find((item) => item.period === period) ?? REVENUE_DATASETS[1];

  return (
    <ChartCard
      title="Revenue Overview"
      description="Billed vs collected revenue"
      className={className}
      headerExtra={
        <Tabs
          items={PERIOD_TABS}
          value={period}
          onValueChange={(value) => setPeriod(value as RevenuePeriod)}
          aria-label="Revenue period"
          variant="pills"
          className="w-auto"
        />
      }
    >
      <MultiLineChart
        labels={dataset?.labels ?? []}
        series={dataset?.series ?? []}
        height={230}
        formatValue={(value) => formatRevenue(value, period)}
      />
    </ChartCard>
  );
}
