"use client";

import * as React from "react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchMembershipHistory } from "@/lib/org/memberships";
import { formatDateTime } from "@/lib/format";
import type { AuditLogRow } from "@/lib/org/members";
import { Clock } from "lucide-react";

const ACTION_LABELS: Record<string, string> = {
  "membership.created": "Assigned",
  "membership.updated": "Updated",
  "membership.reactivated": "Reactivated",
  "membership.expired": "Expired",
  "membership.cancelled": "Cancelled",
  "membership.status_changed": "Status changed",
  "membership.freeze_recorded": "Frozen",
  "membership.extended": "Extended",
  "membership.renewed": "Renewed",
};

export function MembershipHistory({ membershipId }: { membershipId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [rows, setRows] = React.useState<AuditLogRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMembershipHistory(orgId, membershipId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, membershipId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">History</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Assignment, freeze, extend and status changes for this membership.
        </p>
      </div>
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState label="Loading history…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Clock}
          title="No history yet"
          description="Changes to this membership will appear here."
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li key={row.id} className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0">
              <div>
                <p className="text-sm font-medium text-ink">
                  {ACTION_LABELS[row.action] ?? row.action}
                </p>
                <p className="text-xs text-neutral-500">{row.actorName ?? "System"}</p>
              </div>
              <p className="shrink-0 text-xs text-neutral-400">{formatDateTime(row.createdAt)}</p>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
