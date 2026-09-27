"use client";

import * as React from "react";
import { BadgeCheck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { DecorativeIcon } from "@/components/ui/decorative-icon";
import { useOrganization } from "@/components/auth/org-provider";
import { MembershipLifecycleActions } from "@/components/memberships/membership-actions";
import { fetchMembershipsForMember } from "@/lib/org/memberships";
import { formatCurrency, formatDate } from "@/lib/format";
import type { MembershipRow } from "@/lib/operations/adapters";

export function MemberMembershipsPanel({ memberId }: { memberId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canAssign = can("memberships.create");

  const [rows, setRows] = React.useState<MembershipRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMembershipsForMember(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, memberId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading memberships…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BadgeCheck}
        title="No memberships yet"
        description="Assign a plan to this member. Payment is collected in Billing."
        action={
          canAssign
            ? { label: "Assign membership", href: `/memberships/active/add?memberId=${memberId}` }
            : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      {canAssign && (
        <div className="flex justify-end">
          <ButtonLink href={`/memberships/active/add?memberId=${memberId}`} size="sm">
            Assign membership
          </ButtonLink>
        </div>
      )}
      {rows.map((row) => (
        <Card key={row.id} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <DecorativeIcon icon={BadgeCheck} className="mt-0.5 size-4 text-primary-700" />
              <div>
                <p className="text-sm font-medium text-ink">{row.planName}</p>
                <p className="text-xs text-neutral-500">
                  {formatDate(row.startDate)} – {formatDate(row.endDate)} · {row.branchName}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <StatusBadge status={row.status} />
              <span className="text-sm tabular-nums text-ink">
                {formatCurrency(row.finalAmount, currency)}
              </span>
              <ButtonLink href={`/memberships/active/${row.id}`} variant="outline" size="sm">
                View
              </ButtonLink>
            </div>
          </div>
          <MembershipLifecycleActions row={row} onChanged={() => void load()} />
        </Card>
      ))}
    </div>
  );
}
