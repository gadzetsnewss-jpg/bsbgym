"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, CalendarDays } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchUpcomingClasses } from "@/lib/dashboard/client";
import type { UpcomingClass } from "@/types/dashboard";

function Capacity({ cls }: { cls: UpcomingClass }) {
  const ratio = cls.capacity > 0 ? cls.booked / cls.capacity : 0;
  const full = cls.capacity > 0 && cls.booked >= cls.capacity;
  const nearFull = ratio >= 0.9;

  return (
    <div className="min-w-28">
      <div className="flex items-center justify-between text-xs">
        <span className={cn("font-medium", full ? "text-red-600" : "text-ink")}>
          {cls.booked}/{cls.capacity}
        </span>
        {full && (
          <Badge tone="danger" withDot>
            Full
          </Badge>
        )}
      </div>
      <div
        role="progressbar"
        aria-valuenow={Math.round(ratio * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${cls.name} capacity`}
        className="mt-1 h-1.5 overflow-hidden rounded-full bg-neutral-100"
      >
        <div
          className={cn(
            "h-full rounded-full",
            full ? "bg-red-500" : nearFull ? "bg-amber-500" : "bg-primary-500",
          )}
          style={{ width: `${Math.min(ratio * 100, 100)}%` }}
        />
      </div>
    </div>
  );
}

export function UpcomingClasses({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("classes.view") || can("dashboard.view");

  const [rows, setRows] = React.useState<UpcomingClass[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchUpcomingClasses(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Upcoming Classes</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">Scheduled group class sessions</p>
        </div>
        <Link
          href="/classes/schedule"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          Schedule
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>

      {!canView ? (
        <div className="p-5">
          <EmptyState title="Classes are restricted" description="You do not have permission to view classes." />
        </div>
      ) : error ? (
        <div className="p-5">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <LoadingState label="Loading classes…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState
            icon={CalendarDays}
            title="No upcoming classes"
            description="Schedule a session from Class schedule."
            action={{ label: "Schedule session", href: "/classes/schedule/add" }}
          />
        </div>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((cls) => (
            <li key={cls.id} className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-neutral-50/70">
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                <CalendarDays aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">{cls.name}</p>
                <p className="truncate text-xs text-neutral-500">
                  {cls.time} · {cls.duration} · {cls.trainer}
                </p>
              </div>
              <Capacity cls={cls} />
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
