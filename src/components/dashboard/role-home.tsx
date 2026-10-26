"use client";

import * as React from "react";
import { CalendarDays, Dumbbell, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchGymMember,
  fetchLinkedGymMemberId,
  fetchLinkedTrainerId,
  fetchMemberPtSessions,
  fetchTrainerAssignedMembers,
  fetchTrainerPtSessions,
  type GymMemberRow,
  type MemberPtSessionRow,
  type TrainerAssignedMemberRow,
  type TrainerSessionRow,
} from "@/lib/org/gym-members";
import { formatDate, formatDateTime } from "@/lib/format";

function humanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function TrainerHome() {
  const { organization, profile } = useOrganization();
  const orgId = organization?.id;
  const userId = profile?.id;

  const [trainerId, setTrainerId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<TrainerAssignedMemberRow[]>([]);
  const [sessions, setSessions] = React.useState<TrainerSessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const linked = await fetchLinkedTrainerId(orgId, userId);
    if (linked.error) {
      setLoading(false);
      setError(linked.error.message);
      return;
    }
    if (!linked.data) {
      setTrainerId(null);
      setMembers([]);
      setSessions([]);
      setLoading(false);
      return;
    }
    const [memberResult, ptResult] = await Promise.all([
      fetchTrainerAssignedMembers(orgId, linked.data),
      fetchTrainerPtSessions(orgId, linked.data),
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
    setTrainerId(linked.data);
    setMembers(memberResult.data.filter((row) => row.status === "active"));
    setSessions(ptResult.data);
  }, [orgId, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading your members…" />;
  if (!trainerId) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Trainer profile is not linked"
        description="Ask an owner to link your login on your trainer profile. Until then you cannot see assigned members."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">My members</h2>
          <ButtonLink href="/members" variant="outline" size="sm">
            View all
          </ButtonLink>
        </div>
        {members.length === 0 ? (
          <EmptyState
            icon={UserRound}
            title="No assigned members"
            description="Members assigned to you appear here and on Members."
          />
        ) : (
          members.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.memberName}</p>
                <p className="text-xs text-neutral-500">{formatDate(row.assignedAt)}</p>
              </div>
              <ButtonLink href={`/members/${row.memberId}`} variant="outline" size="sm">
                View
              </ButtonLink>
            </div>
          ))
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">PT sessions</h2>
          <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
            View all
          </ButtonLink>
        </div>
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No PT sessions"
            description="Sessions with your assigned members appear here."
          />
        ) : (
          sessions.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
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
            </div>
          ))
        )}
      </Card>
    </div>
  );
}

export function MemberHome() {
  const { organization, profile } = useOrganization();
  const orgId = organization?.id;
  const userId = profile?.id;

  const [member, setMember] = React.useState<GymMemberRow | null>(null);
  const [sessions, setSessions] = React.useState<MemberPtSessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const linked = await fetchLinkedGymMemberId(orgId, userId);
    if (linked.error) {
      setLoading(false);
      setError(linked.error.message);
      return;
    }
    if (!linked.data) {
      setMember(null);
      setSessions([]);
      setLoading(false);
      return;
    }
    const [memberResult, ptResult] = await Promise.all([
      fetchGymMember(orgId, linked.data),
      fetchMemberPtSessions(orgId, linked.data),
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
    setMember(memberResult.data);
    setSessions(ptResult.data);
  }, [orgId, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading your training…" />;
  if (!member) {
    return (
      <EmptyState
        icon={UserRound}
        title="Member profile is not linked"
        description="Ask an owner to link your login on your member profile. Until then you cannot see My PT."
      />
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      <Card className="space-y-3">
        <h2 className="text-sm font-semibold text-ink">My trainer</h2>
        {member.assignedTrainerName ? (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium text-ink">{member.assignedTrainerName}</p>
            <ButtonLink href={`/members/${member.id}`} variant="outline" size="sm">
              View profile
            </ButtonLink>
          </div>
        ) : (
          <EmptyState
            icon={Dumbbell}
            title="No trainer assigned"
            description="Your gym can assign a trainer from Trainers > Assignments."
          />
        )}
      </Card>

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">My PT</h2>
          <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
            View all
          </ButtonLink>
        </div>
        {sessions.length === 0 ? (
          <EmptyState
            icon={CalendarDays}
            title="No PT sessions"
            description="Personal training sessions with your trainer appear here."
          />
        ) : (
          sessions.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.trainerName}</p>
                <p className="text-xs text-neutral-500">{formatDateTime(row.scheduledAt)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(row.status)} />
                <ButtonLink href={`/trainers/pt-sessions/${row.id}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </div>
          ))
        )}
      </Card>
    </div>
  );
}
