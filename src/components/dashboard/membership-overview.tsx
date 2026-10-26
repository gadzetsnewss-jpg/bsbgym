"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { DonutChart, type DonutSegment } from "@/components/ui/chart";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchMembershipOverviewStats } from "@/lib/dashboard/client";
import type { MembershipOverviewStats } from "@/types/dashboard";

function segmentsFrom(stats: MembershipOverviewStats): DonutSegment[] {
  return [
    { name: "Active", value: stats.active, color: "var(--color-primary-500)" },
    { name: "Expiring", value: stats.expiring, color: "var(--color-amber-500)" },
    { name: "Frozen window", value: stats.frozen, color: "var(--color-sky-500)" },
    { name: "Expired", value: stats.expired, color: "var(--color-red-500)" },
  ];
}

export function MembershipOverview({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("memberships.view") || can("dashboard.view");
  const [stats, setStats] = React.useState<MembershipOverviewStats | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMembershipOverviewStats(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setStats(result.data);
  }, [orgId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const segments = stats ? segmentsFrom(stats) : [];
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <ChartCard
      title="Membership Overview"
      description="Active, expiring, expired, and open freeze windows. Freeze is a timeline window, not a membership status."
      className={className}
    >
      {!canView ? (
        <EmptyState title="Memberships are restricted" description="You do not have permission to view memberships." />
      ) : error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !stats ? (
        <LoadingState label="Loading memberships…" />
      ) : (
        <>
          <DonutChart
            segments={segments}
            centerValue={stats.active}
            centerLabel="Active"
            size={172}
          />

          <ul className="mt-5 space-y-2.5">
            {segments.map((segment) => {
              const share = total === 0 ? 0 : (segment.value / total) * 100;
              return (
                <li key={segment.name} className="flex items-center gap-2.5 text-sm">
                  <span
                    aria-hidden="true"
                    className="size-2.5 shrink-0 rounded-sm"
                    style={{ backgroundColor: segment.color }}
                  />
                  <span className="flex-1 text-neutral-600">{segment.name}</span>
                  <span className="font-medium text-ink">
                    {segment.value.toLocaleString()}
                  </span>
                  <span className="w-10 text-right text-xs text-neutral-400">
                    {share.toFixed(0)}%
                  </span>
                </li>
              );
            })}
          </ul>

          <Link
            href="/memberships/active"
            className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
          >
            Manage memberships
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </>
      )}
    </ChartCard>
  );
}
