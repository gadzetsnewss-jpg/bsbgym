"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchUpcomingExpiryLive } from "@/lib/dashboard/client";
import type { ExpiryItem } from "@/types/dashboard";

function DaysBadge({ daysLeft }: { daysLeft: number }) {
  const tone = daysLeft <= 5 ? "danger" : daysLeft <= 10 ? "warning" : "neutral";
  const label =
    daysLeft === 0
      ? "Expires today"
      : daysLeft === 1
        ? "1 day left"
        : `${daysLeft} days left`;
  return <Badge tone={tone} withDot>{label}</Badge>;
}

export function UpcomingExpiry({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("memberships.view") || can("dashboard.view");
  const { dateFormat } = useFinanceSettings();
  const [rows, setRows] = React.useState<ExpiryItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchUpcomingExpiryLive(orgId, dateFormat);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, canView, dateFormat]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Upcoming Expiry</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Active memberships ending within 30 days
          </p>
        </div>
        <Link
          href="/members/expiring"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>
      {!canView ? (
        <div className="p-5">
          <EmptyState title="Memberships are restricted" description="You do not have permission to view memberships." />
        </div>
      ) : error ? (
        <div className="p-5">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <LoadingState label="Loading expiries…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No memberships expiring soon" description="Active memberships ending in the next 30 days appear here." />
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border">
            {rows.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-neutral-50/70"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                  <Clock aria-hidden="true" className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-ink">{item.name}</p>
                  <p className="truncate text-xs text-neutral-500">
                    {item.plan} · expires {item.expiresOn}
                  </p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1.5">
                  <DaysBadge daysLeft={item.daysLeft} />
                  <ButtonLink
                    href="/memberships/renewals"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-2 text-xs"
                  >
                    Renew
                  </ButtonLink>
                </div>
              </li>
            ))}
          </ul>
          <div className="border-t border-border px-5 py-3">
            <p className="text-xs text-neutral-400">
              <span className="font-medium text-neutral-500">{rows.length} memberships</span>{" "}
              shown from those ending in the next 30 days
            </p>
          </div>
        </>
      )}
    </Card>
  );
}
