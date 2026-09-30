"use client";

import * as React from "react";
import { CalendarDays, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchTrainerAssignedMembers,
  fetchTrainerClassSessions,
  fetchTrainerPtSessions,
  type TrainerAssignedMemberRow,
  type TrainerSessionRow,
} from "@/lib/org/gym-members";
import { formatDate, formatDateTime } from "@/lib/format";
import type { TrainerRow } from "@/lib/catalog/adapters";

function humanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function trainerDetailExtras(row: TrainerRow) {
  return <TrainerDetailExtras trainerId={row.id} />;
}

function TrainerDetailExtras({ trainerId }: { trainerId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("trainers.view");
  const canAssign = can("trainers.assign");

  const [members, setMembers] = React.useState<TrainerAssignedMemberRow[]>([]);
  const [ptSessions, setPtSessions] = React.useState<TrainerSessionRow[]>([]);
  const [classSessions, setClassSessions] = React.useState<TrainerSessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [memberResult, ptResult, classResult] = await Promise.all([
      fetchTrainerAssignedMembers(orgId, trainerId),
      fetchTrainerPtSessions(orgId, trainerId),
      fetchTrainerClassSessions(orgId, trainerId),
    ]);
    setLoading(false);
    if (memberResult.error) {
      setError(memberResult.error.message);
      return;
    }
    if (ptResult.error) {
      setError(ptResult.error.message);
      return;
    }
    if (classResult.error) {
      setError(classResult.error.message);
      return;
    }
    setMembers(memberResult.data);
    setPtSessions(ptResult.data);
    setClassSessions(classResult.data);
  }, [orgId, trainerId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading trainer activity…" />;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Assigned members</h3>
          {canAssign && (
            <ButtonLink href={`/trainers/assignments/add?trainerId=${trainerId}`} size="sm">
              Assign member
            </ButtonLink>
          )}
        </div>
        {members.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No assigned members"
            description="Assign this trainer from Trainers > Assignments."
            action={
              canAssign
                ? { label: "Assign member", href: `/trainers/assignments/add?trainerId=${trainerId}` }
                : undefined
            }
          />
        ) : (
          members.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.memberName}</p>
                <p className="text-xs text-neutral-500">{formatDate(row.assignedAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(row.status)} />
                <ButtonLink href={`/members/${row.memberId}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Recent PT sessions</h3>
        {ptSessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No PT sessions"
            description="Schedule a PT session for this trainer."
            action={
              canAssign
                ? { label: "Schedule PT", href: `/trainers/pt-sessions/add?trainerId=${trainerId}` }
                : undefined
            }
          />
        ) : (
          ptSessions.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.memberName ?? "Member"}</p>
                <p className="text-xs text-neutral-500">{formatDateTime(row.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(row.status)} />
                <ButtonLink href={row.href} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </Card>
          ))
        )}
      </section>

      <section className="space-y-3">
        <h3 className="text-sm font-semibold text-ink">Upcoming classes</h3>
        {classSessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No class sessions"
            description="Schedule a class session with this trainer."
          />
        ) : (
          classSessions.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.className ?? "Class"}</p>
                <p className="text-xs text-neutral-500">{formatDateTime(row.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(row.status)} />
                <ButtonLink href={row.href} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </Card>
          ))
        )}
      </section>
    </div>
  );
}
