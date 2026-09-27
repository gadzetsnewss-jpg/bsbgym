"use client";

import * as React from "react";
import { Snowflake } from "lucide-react";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchMembershipFreezes,
  type MembershipFreezeEvent,
} from "@/lib/org/memberships";
import { formatDate } from "@/lib/format";
import type { MembershipRow } from "@/lib/operations/adapters";

export function MembershipFreezeHistory({ row }: { row: MembershipRow }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [rows, setRows] = React.useState<MembershipFreezeEvent[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMembershipFreezes(orgId, row.id);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, row.id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const remaining = Math.max(row.planMaxFreezeDays - row.freezeDaysUsed, 0);

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Freeze history</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {row.freezeDaysUsed} of {row.planMaxFreezeDays} freeze days used
          {row.planMaxFreezeDays > 0 ? ` · ${remaining} remaining` : ""}. Freeze
          does not change member status.
        </p>
      </div>
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState label="Loading freezes…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={Snowflake}
          title="No freezes recorded"
          description="Freeze windows for this membership will appear here."
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((freeze) => (
            <li
              key={freeze.id}
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">
                  {formatDate(freeze.startDate)} – {formatDate(freeze.endDate)}
                </p>
                <p className="text-xs text-neutral-500">
                  {freeze.days} day{freeze.days === 1 ? "" : "s"}
                  {freeze.reason ? ` · ${freeze.reason}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
