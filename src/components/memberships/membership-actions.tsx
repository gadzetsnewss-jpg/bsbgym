"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarPlus, RefreshCcw } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { Input } from "@/components/ui/input";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { DecorativeIcon } from "@/components/ui/decorative-icon";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { MembershipBillingHandoff } from "@/components/memberships/membership-billing-handoff";
import { extendMembership, renewMembership } from "@/lib/org/memberships";
import { loadPlanOptions } from "@/lib/operations/adapters";
import type { MembershipRow } from "@/lib/operations/adapters";
import type { SelectOption } from "@/components/ui/select";

export function MembershipLifecycleActions({
  row,
  onChanged,
}: {
  row: MembershipRow;
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;

  const canExtend = can("memberships.extend") && row.status === "active";
  const canRenew = can("memberships.create");
  const canFreeze = can("memberships.freeze") && row.status === "active";
  const canUpgrade = can("memberships.update") && row.status === "active";
  const canAssignTrainer = can("trainers.assign");

  const [extendOpen, setExtendOpen] = React.useState(false);
  const [renewOpen, setRenewOpen] = React.useState(false);
  const [days, setDays] = React.useState("7");
  const [planId, setPlanId] = React.useState(row.planId);
  const [plans, setPlans] = React.useState<SelectOption[]>([]);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!orgId || !renewOpen) return;
    void loadPlanOptions(orgId).then(setPlans);
  }, [orgId, renewOpen]);

  const submitExtend = async () => {
    const parsed = Number(days);
    if (!Number.isInteger(parsed) || parsed <= 0) {
      toast({ title: "Enter a whole number of days greater than zero", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await extendMembership(row.id, parsed);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not extend membership", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Membership extended", variant: "success" });
    setExtendOpen(false);
    onChanged?.();
    router.refresh();
  };

  const submitRenew = async () => {
    setSaving(true);
    const result = await renewMembership({ membershipId: row.id, planId: planId || row.planId });
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not renew membership", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Membership renewed", variant: "success" });
    setRenewOpen(false);
    onChanged?.();
    router.push(`/memberships/active/${result.data.id}`);
    router.refresh();
  };

  if (!canExtend && !canRenew && !canFreeze && !canUpgrade && !canAssignTrainer) return null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {canExtend && (
          <Button variant="outline" onClick={() => setExtendOpen(true)}>
            <DecorativeIcon icon={CalendarPlus} className="size-4" />
            Extend
          </Button>
        )}
        {canRenew && (
          <Button variant="outline" onClick={() => setRenewOpen(true)}>
            <DecorativeIcon icon={RefreshCcw} className="size-4" />
            Renew
          </Button>
        )}
        {canFreeze && (
          <ButtonLink href={`/memberships/freeze-extend/add?membershipId=${row.id}`} variant="outline">
            Freeze
          </ButtonLink>
        )}
        {canUpgrade && (
          <ButtonLink href={`/memberships/active/${row.id}/edit`} variant="outline">
            Change plan
          </ButtonLink>
        )}
        {canAssignTrainer && (
          <ButtonLink href={`/trainers/assignments/add?memberId=${row.memberId}`} variant="outline">
            Change trainer
          </ButtonLink>
        )}
        {can("billing.create") && (
          <ButtonLink href={`/billing/new-invoice?memberId=${row.memberId}&membershipId=${row.id}`} variant="outline">
            Create invoice
          </ButtonLink>
        )}
      </div>

      <Modal
        open={extendOpen}
        onClose={() => setExtendOpen(false)}
        title="Extend membership"
        description="Adds days to the current end date. This does not collect payment."
        footer={
          <>
            <Button variant="outline" onClick={() => setExtendOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitExtend()} isLoading={saving}>
              Extend
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <MembershipBillingHandoff context="extend" memberId={row.memberId} membershipId={row.id} />
          <FormField label="Days to add" required>
            <Input
              type="number"
              min={1}
              step={1}
              value={days}
              onChange={(event) => setDays(event.target.value)}
            />
          </FormField>
        </div>
      </Modal>

      <Modal
        open={renewOpen}
        onClose={() => setRenewOpen(false)}
        title="Renew membership"
        description="Creates a new membership starting after the current end date. Invoices stay in Billing."
        footer={
          <>
            <Button variant="outline" onClick={() => setRenewOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submitRenew()} isLoading={saving}>
              Renew
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <MembershipBillingHandoff context="renew" memberId={row.memberId} membershipId={row.id} />
          <FormField label="Plan" required>
            <Select
              value={planId}
              onChange={(event) => setPlanId(event.target.value)}
              options={plans.length > 0 ? plans : [{ value: row.planId, label: row.planName }]}
            />
          </FormField>
        </div>
      </Modal>
    </>
  );
}
