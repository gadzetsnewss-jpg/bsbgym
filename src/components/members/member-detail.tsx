"use client";

/**
 * Gym member profile (Phase 3.1).
 *
 * Read-only profile with status actions and related membership, billing,
 * attendance, trainer, fitness, and activity data.
 */

import * as React from "react";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  CreditCard,
  Dumbbell,
  IdCard,
  Mail,
  MapPin,
  Pencil,
  Phone,
  UserRoundCheck,
  UserMinus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { UserAvatar } from "@/components/ui/user-avatar";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  fetchGymMember,
  setGymMemberStatus,
  type GymMemberRow,
} from "@/lib/org/gym-members";
import { GYM_MEMBER_STATUS_LABELS } from "@/lib/auth/permissions";
import { displayName, formatDate } from "@/lib/format";
import type { GymMemberStatus } from "@/lib/supabase/types";
import { MemberMembershipsPanel } from "@/components/members/member-memberships-panel";
import {
  MemberActivityPanel,
  MemberAttendancePanel,
  MemberBillingPanel,
  MemberFitnessPanel,
  MemberTrainerPanel,
} from "@/components/members/member-related-panels";

const GENDER_LABELS: Record<string, string> = {
  male: "Male",
  female: "Female",
  other: "Other",
  unspecified: "Unspecified",
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 py-2">
      <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="text-sm text-ink">{value || "—"}</dd>
    </div>
  );
}

export interface MemberDetailProps {
  memberId: string;
}

export function MemberDetail({ memberId }: MemberDetailProps) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;

  const canEdit = can("members.update");
  const canDeactivate = can("members.delete");
  const canAssignMembership = can("memberships.create");
  const canCreateInvoice = can("billing.create");
  const canAssignTrainer = can("trainers.assign");

  const [member, setMember] = React.useState<GymMemberRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState("profile");
  const [pending, setPending] = React.useState<"activate" | "deactivate" | "suspend" | null>(null);
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchGymMember(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMember(result.data);
  }, [orgId, memberId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const confirmStatus = async () => {
    if (!pending || !member) return;
    const next: GymMemberStatus =
      pending === "activate" ? "active" : pending === "suspend" ? "suspended" : "inactive";
    setSaving(true);
    const result = await setGymMemberStatus(member.id, next);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not update member", description: result.error.message, variant: "error" });
      return;
    }
    toast({
      title:
        pending === "activate"
          ? "Member activated"
          : pending === "suspend"
            ? "Member suspended"
            : "Member deactivated",
      variant: "success",
    });
    setPending(null);
    void load();
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <PageHeader title="Member" icon={Users} />
        <LoadingState label="Loading member…" />
      </div>
    );
  }

  if (error || !member) {
    return (
      <div className="space-y-6">
        <PageHeader title="Member" icon={Users} />
        <ErrorState
          title="Member unavailable"
          description={error ?? "That item could not be found."}
          onRetry={() => void load()}
        />
        <ButtonLink href="/members" variant="outline" size="sm">
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to members
        </ButtonLink>
      </div>
    );
  }

  const name = displayName(member);

  return (
    <div className="space-y-6">
      <PageHeader
        title={name}
        description={`${member.code} • ${member.branchName}`}
        icon={Users}
        actions={
          <>
            <ButtonLink href="/members" variant="outline">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </ButtonLink>
            {canAssignMembership && (
              <ButtonLink href={`/memberships/active/add?memberId=${member.id}`} variant="outline">
                Add membership
              </ButtonLink>
            )}
            {canCreateInvoice && (
              <ButtonLink href={`/billing/new-invoice?memberId=${member.id}`} variant="outline">
                New invoice
              </ButtonLink>
            )}
            {canAssignTrainer && (
              <ButtonLink href={`/trainers/assignments/add?memberId=${member.id}`} variant="outline">
                {member.assignedTrainerName ? "Change trainer" : "Assign trainer"}
              </ButtonLink>
            )}
            {canEdit && (
              <ButtonLink href={`/members/${member.id}/edit`}>
                <Pencil aria-hidden="true" className="size-4" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <UserAvatar name={name} src={member.photoUrl ?? undefined} size="lg" />
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-semibold text-ink">{name}</h2>
              <StatusBadge status={GYM_MEMBER_STATUS_LABELS[member.status] ?? member.status} />
            </div>
            <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-neutral-500">
              <span className="inline-flex items-center gap-1.5">
                <IdCard aria-hidden="true" className="size-4" />
                {member.code}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <MapPin aria-hidden="true" className="size-4" />
                {member.branchName}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays aria-hidden="true" className="size-4" />
                Joined {formatDate(member.joinedAt)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && member.status === "active" && (
            <Button variant="outline" onClick={() => setPending("suspend")}>
              <UserMinus aria-hidden="true" className="size-4" />
              Suspend
            </Button>
          )}
          {canDeactivate && member.status !== "inactive" && (
            <Button variant="outline" onClick={() => setPending("deactivate")}>
              <UserMinus aria-hidden="true" className="size-4" />
              Deactivate
            </Button>
          )}
          {(canEdit || canDeactivate) && member.status !== "active" && (
            <Button onClick={() => setPending("activate")}>
              <UserRoundCheck aria-hidden="true" className="size-4" />
              Activate
            </Button>
          )}
        </div>
      </Card>

      <Tabs
        aria-label="Member sections"
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "profile", label: "Profile", icon: Users },
          { value: "membership", label: "Membership", icon: Dumbbell },
          { value: "billing", label: "Billing", icon: CreditCard },
          { value: "attendance", label: "Attendance", icon: CalendarDays },
          { value: "trainer", label: "Trainer", icon: UserRoundCheck },
          { value: "fitness", label: "Fitness", icon: Dumbbell },
          { value: "activity", label: "Activity", icon: Activity },
        ]}
      >
        {tab === "profile" && (
          <div className="grid gap-6 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <h3 className="mb-2 text-sm font-semibold text-ink">Contact</h3>
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <DetailRow
                  label="Phone"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Phone aria-hidden="true" className="size-4 text-neutral-400" />
                      {member.phone}
                    </span>
                  }
                />
                <DetailRow
                  label="Email"
                  value={
                    member.email ? (
                      <span className="inline-flex items-center gap-1.5">
                        <Mail aria-hidden="true" className="size-4 text-neutral-400" />
                        {member.email}
                      </span>
                    ) : null
                  }
                />
                <DetailRow label="Date of birth" value={formatDate(member.dateOfBirth)} />
                <DetailRow
                  label="Gender"
                  value={member.gender ? GENDER_LABELS[member.gender] ?? member.gender : null}
                />
                <DetailRow label="Emergency contact" value={member.emergencyContactName} />
                <DetailRow label="Emergency phone" value={member.emergencyContactPhone} />
              </dl>
            </Card>

            <Card>
              <h3 className="mb-2 text-sm font-semibold text-ink">Address</h3>
              <dl>
                <DetailRow label="Address" value={member.addressLine1} />
                <DetailRow label="Address line 2" value={member.addressLine2} />
                <DetailRow label="City" value={member.city} />
                <DetailRow label="State" value={member.state} />
                <DetailRow label="Postal code" value={member.postalCode} />
                <DetailRow label="Country" value={member.country} />
              </dl>
            </Card>

            <Card className="lg:col-span-3">
              <h3 className="mb-2 text-sm font-semibold text-ink">Notes</h3>
              <p className="text-sm whitespace-pre-wrap text-neutral-600">
                {member.notes || "No notes recorded."}
              </p>
            </Card>

            <Card className="lg:col-span-3">
              <h3 className="mb-3 text-sm font-semibold text-ink">Trainer</h3>
              <div className="flex flex-wrap items-center gap-3">
                {member.assignedTrainerName ? (
                  <Badge tone="primary">{member.assignedTrainerName}</Badge>
                ) : (
                  <Badge tone="neutral">Unassigned</Badge>
                )}
                <p className="text-sm text-neutral-500">
                  Assign or reassign trainers from Trainers &gt; Assignments.
                </p>
              </div>
            </Card>
          </div>
        )}

        {tab === "membership" && <MemberMembershipsPanel memberId={member.id} />}
        {tab === "billing" && <MemberBillingPanel memberId={member.id} />}
        {tab === "attendance" && <MemberAttendancePanel memberId={member.id} />}
        {tab === "trainer" && (
          <MemberTrainerPanel
            memberId={member.id}
            assignedTrainerName={member.assignedTrainerName}
          />
        )}
        {tab === "fitness" && <MemberFitnessPanel memberId={member.id} />}
        {tab === "activity" && <MemberActivityPanel memberId={member.id} />}
      </Tabs>

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmStatus()}
        title={
          pending === "activate"
            ? "Activate member"
            : pending === "suspend"
              ? "Suspend member"
              : "Deactivate member"
        }
        description={
          pending === "activate"
            ? `${name} will be marked active again.`
            : pending === "suspend"
              ? `${name} will be suspended until reactivated.`
              : `${name} will be marked inactive. The record is kept — no data is deleted.`
        }
        confirmLabel={
          pending === "activate" ? "Activate" : pending === "suspend" ? "Suspend" : "Deactivate"
        }
        tone={pending === "activate" ? "primary" : "danger"}
        isLoading={saving}
      />
    </div>
  );
}
