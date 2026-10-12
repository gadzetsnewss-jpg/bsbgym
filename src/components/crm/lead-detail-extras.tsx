"use client";

import * as React from "react";
import {
  BadgeCheck,
  CreditCard,
  FlaskConical,
  PhoneCall,
  UserPlus,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fetchLeadFollowUps, fetchLeadTrials } from "@/lib/crm/client";
import type { FollowUpRow, LeadRow, TrialRow } from "@/lib/crm/adapters";
import { formatDate, formatDateTime } from "@/lib/format";

export function leadDetailExtras(row: LeadRow) {
  return (
    <>
      <LeadLifecycleActions lead={row} />
      <LeadRelatedHistory lead={row} />
    </>
  );
}

function LeadLifecycleActions({ lead }: { lead: LeadRow }) {
  const { can } = useOrganization();
  const canManageCrm = can(PERMISSIONS.crm.manage);
  const canCreateMember = can(PERMISSIONS.members.create);
  const canAssignMembership = can(PERMISSIONS.memberships.create);
  const canCreateInvoice = can(PERMISSIONS.billing.create);
  const canAssignTrainer = can(PERMISSIONS.trainers.assign);
  const converted = Boolean(lead.convertedMemberId);
  const branchQuery = lead.branchId ? `&branchId=${encodeURIComponent(lead.branchId)}` : "";

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Next step</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          {converted
            ? "This lead is a member. Continue in Members, Memberships and Billing."
            : "Keep this lead in context. Follow up, start a trial, or convert without searching again."}
        </p>
      </div>
      {converted && lead.convertedMemberName && (
        <p className="text-sm text-ink">
          Member: <span className="font-medium">{lead.convertedMemberName}</span>
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {converted && lead.convertedMemberId ? (
          <>
            <ButtonLink href={`/members/${lead.convertedMemberId}`} variant="outline" size="sm">
              <Users aria-hidden="true" className="size-4" />
              View member
            </ButtonLink>
            {canAssignMembership && (
              <ButtonLink
                href={`/memberships/active/add?memberId=${lead.convertedMemberId}${branchQuery}`}
                variant="outline"
                size="sm"
              >
                <BadgeCheck aria-hidden="true" className="size-4" />
                Add membership
              </ButtonLink>
            )}
            {canCreateInvoice && (
              <ButtonLink
                href={`/billing/new-invoice?memberId=${lead.convertedMemberId}${branchQuery}`}
                variant="outline"
                size="sm"
              >
                <CreditCard aria-hidden="true" className="size-4" />
                Create invoice
              </ButtonLink>
            )}
            {canAssignTrainer && (
              <ButtonLink
                href={`/trainers/assignments/add?memberId=${lead.convertedMemberId}`}
                variant="outline"
                size="sm"
              >
                <UserPlus aria-hidden="true" className="size-4" />
                Assign trainer
              </ButtonLink>
            )}
          </>
        ) : (
          <>
            {canManageCrm && (
              <ButtonLink href={`/crm/follow-ups/add?leadId=${lead.id}${branchQuery}`} variant="outline" size="sm">
                <PhoneCall aria-hidden="true" className="size-4" />
                Add follow-up
              </ButtonLink>
            )}
            {canManageCrm && (
              <ButtonLink href={`/crm/trials/add?leadId=${lead.id}${branchQuery}`} variant="outline" size="sm">
                <FlaskConical aria-hidden="true" className="size-4" />
                Schedule trial
              </ButtonLink>
            )}
            {canManageCrm && canCreateMember && (
              <ButtonLink href={`/crm/leads/${lead.id}/convert`} size="sm">
                Convert to member
              </ButtonLink>
            )}
          </>
        )}
      </div>
    </Card>
  );
}

function LeadRelatedHistory({ lead }: { lead: LeadRow }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [followUps, setFollowUps] = React.useState<FollowUpRow[] | null>(null);
  const [trials, setTrials] = React.useState<TrialRow[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void Promise.all([fetchLeadFollowUps(orgId, lead.id), fetchLeadTrials(orgId, lead.id)]).then(
      ([followResult, trialResult]) => {
        if (cancelled) return;
        if (followResult.error || trialResult.error) {
          setError(followResult.error?.message ?? trialResult.error?.message ?? "Could not load history.");
          return;
        }
        setFollowUps(followResult.data);
        setTrials(trialResult.data);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [orgId, lead.id]);

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Follow-up history</h2>
          <p className="mt-0.5 text-sm text-neutral-500">Scheduled, completed and cancelled follow-ups stay here.</p>
        </div>
        {error ? (
          <ErrorState description={error} />
        ) : followUps === null ? (
          <LoadingState label="Loading follow-ups…" />
        ) : followUps.length === 0 ? (
          <p className="text-sm text-neutral-500">No follow-ups yet.</p>
        ) : (
          <ul className="space-y-3">
            {followUps.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">{formatDateTime(item.dueAt)}</p>
                  <p className="truncate text-sm text-neutral-500">{item.notes || "No notes"}</p>
                </div>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
      <Card className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Trial history</h2>
          <p className="mt-0.5 text-sm text-neutral-500">A trial visit does not create a membership.</p>
        </div>
        {error ? (
          <ErrorState description={error} />
        ) : trials === null ? (
          <LoadingState label="Loading trials…" />
        ) : trials.length === 0 ? (
          <p className="text-sm text-neutral-500">No trials yet.</p>
        ) : (
          <ul className="space-y-3">
            {trials.map((item) => (
              <li key={item.id} className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm text-ink">
                    {formatDate(item.startsOn)} – {formatDate(item.endsOn)}
                  </p>
                  <p className="truncate text-sm text-neutral-500">{item.branchName || item.notes || "Trial"}</p>
                </div>
                <StatusBadge status={item.status} />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
