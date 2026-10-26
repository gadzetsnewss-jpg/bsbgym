"use client";

import * as React from "react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { MultiLineChart } from "@/components/ui/chart";
import { Tabs } from "@/components/ui/tabs";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchRevenueOverviewLive } from "@/lib/dashboard/client";
import type { RevenueDataset, RevenuePeriod } from "@/types/dashboard";

const PERIOD_TABS = [
  { value: "7d", label: "7 Days" },
  { value: "30d", label: "30 Days" },
  { value: "12m", label: "12 Months" },
];

export function RevenueOverview({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("finance.view") || can("billing.view") || can("payments.view") || can("dashboard.view");
  const { formatMoney } = useFinanceSettings();
  const [period, setPeriod] = React.useState<RevenuePeriod>("30d");
  const [dataset, setDataset] = React.useState<RevenueDataset | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchRevenueOverviewLive(orgId, period);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setDataset(result.data);
  }, [orgId, canView, period]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <ChartCard
      title="Collections overview"
      description="Invoiced totals vs collected cash. Collected is payments + POS + other income, not invoice totals."
      className={className}
      headerExtra={
        <Tabs
          items={PERIOD_TABS}
          value={period}
          onValueChange={(value) => setPeriod(value as RevenuePeriod)}
          aria-label="Collections period"
          variant="pills"
          className="w-auto"
        />
      }
    >
      {!canView ? (
        <EmptyState title="Collections are restricted" description="You do not have permission to view collections." />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !dataset ? (
        <LoadingState label="Loading collections…" />
      ) : (
        <MultiLineChart
          labels={dataset.labels}
          series={dataset.series}
          height={230}
          formatValue={(value) => formatMoney(value)}
        />
      )}
    </ChartCard>
  );
}
