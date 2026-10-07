"use client";

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
import { useOrganization } from "@/components/auth/org-provider";
import { PERMISSIONS } from "@/lib/auth/permissions";
import type { LeadRow } from "@/lib/crm/adapters";

export function leadDetailExtras(row: LeadRow) {
  return <LeadLifecycleActions lead={row} />;
}

function LeadLifecycleActions({ lead }: { lead: LeadRow }) {
  const { can } = useOrganization();
  const canManageCrm = can(PERMISSIONS.crm.manage);
  const canCreateMember = can(PERMISSIONS.members.create);
  const canAssignMembership = can(PERMISSIONS.memberships.create);
  const canCreateInvoice = can(PERMISSIONS.billing.create);
  const canAssignTrainer = can(PERMISSIONS.trainers.assign);
  const converted = Boolean(lead.convertedMemberId);

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
                href={`/memberships/active/add?memberId=${lead.convertedMemberId}`}
                variant="outline"
                size="sm"
              >
                <BadgeCheck aria-hidden="true" className="size-4" />
                Add membership
              </ButtonLink>
            )}
            {canCreateInvoice && (
              <ButtonLink
                href={`/billing/new-invoice?memberId=${lead.convertedMemberId}`}
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
              <ButtonLink href={`/crm/follow-ups/add?leadId=${lead.id}`} variant="outline" size="sm">
                <PhoneCall aria-hidden="true" className="size-4" />
                Schedule follow-up
              </ButtonLink>
            )}
            {canManageCrm && (
              <ButtonLink href={`/crm/trials/add?leadId=${lead.id}`} variant="outline" size="sm">
                <FlaskConical aria-hidden="true" className="size-4" />
                Start trial
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
