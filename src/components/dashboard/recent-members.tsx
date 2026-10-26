"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchRecentMembersLive } from "@/lib/dashboard/client";
import type { MemberRow } from "@/types/dashboard";

const columns: Column<MemberRow>[] = [
  {
    id: "member",
    header: "Member",
    cell: (row) => (
      <div className="flex items-center gap-2.5 whitespace-nowrap">
        <UserAvatar name={row.name} size="sm" />
        <span className="font-medium text-ink">{row.name}</span>
      </div>
    ),
  },
  {
    id: "plan",
    header: "Membership",
    cell: (row) => <span className="whitespace-nowrap">{row.plan}</span>,
  },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => (
      <span className="whitespace-nowrap text-neutral-500">{row.trainer}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: "joined",
    header: "Joined",
    cell: (row) => (
      <span className="whitespace-nowrap text-neutral-500">{row.joinedOn}</span>
    ),
  },
];

export function RecentMembers({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("members.view") || can("dashboard.view");
  const { dateFormat } = useFinanceSettings();
  const [rows, setRows] = React.useState<MemberRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchRecentMembersLive(orgId, dateFormat);
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
          <CardTitle>Recent Members</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Newest member profiles
          </p>
        </div>
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>
      {!canView ? (
        <div className="p-5">
          <EmptyState title="Members are restricted" description="You do not have permission to view members." />
        </div>
      ) : error ? (
        <div className="p-5">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <LoadingState label="Loading members…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No members yet" description="New member profiles appear here." />
        </div>
      ) : (
        <DataTable columns={columns} data={rows} rowKey={(row) => row.id} />
      )}
    </Card>
  );
}
