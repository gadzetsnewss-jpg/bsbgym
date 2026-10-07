"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CheckCircle2,
  CreditCard,
  UserPlus,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { leadAdapter, type LeadRow } from "@/lib/crm/adapters";
import { convertLeadToMember } from "@/lib/crm/client";
import { convertLeadFormSchema } from "@/lib/validation/crm-schemas";

export function ConvertLeadForm({ leadId }: { leadId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;
  const canConvert = can(PERMISSIONS.crm.manage) && can(PERMISSIONS.members.create);
  const canAssignMembership = can(PERMISSIONS.memberships.create);
  const canCreateInvoice = can(PERMISSIONS.billing.create);
  const canAssignTrainer = can(PERMISSIONS.trainers.assign);

  const [lead, setLead] = React.useState<LeadRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [branchId, setBranchId] = React.useState("");
  const [lastName, setLastName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [memberId, setMemberId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void leadAdapter.get(orgId, leadId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setLoadError(result.error.message);
        return;
      }
      setLead(result.data);
      setBranchId(result.data.branchId || currentBranchId || branches[0]?.id || "");
      setLastName(result.data.lastName ?? "");
      setPhone(result.data.phone ?? "");
      if (result.data.convertedMemberId) setMemberId(result.data.convertedMemberId);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, leadId, currentBranchId, branches]);

  const branchOptions = React.useMemo(
    () => branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` })),
    [branches],
  );

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canConvert || memberId) return;
    const parsed = convertLeadFormSchema.safeParse({ branchId, lastName, phone });
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === "string" && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }
    setSubmitting(true);
    const result = await convertLeadToMember({
      leadId,
      branchId: parsed.data.branchId,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
    });
    setSubmitting(false);
    if (result.error || !result.data) {
      toast({
        title: "Could not convert lead",
        description: result.error?.message ?? "Could not convert lead.",
        variant: "error",
      });
      return;
    }
    setMemberId(result.data.id);
    toast({ title: "Lead converted to member", variant: "success" });
    router.refresh();
  };

  if (!orgId) {
    return (
      <EmptyState
        title="Organization unavailable"
        description="Sign in with an organization to continue."
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  if (loading) return <LoadingState label="Loading lead…" />;
  if (loadError || !lead) {
    return <ErrorState description={loadError ?? "That item could not be found."} />;
  }

  const viewHref = memberId ? `/members/${memberId}` : "";
  const membershipHref = memberId ? `/memberships/active/add?memberId=${memberId}` : "";
  const invoiceHref = memberId ? `/billing/new-invoice?memberId=${memberId}` : "";
  const trainerHref = memberId ? `/trainers/assignments/add?memberId=${memberId}` : "";

  return (
    <div className="space-y-6">
      <PageHeader
        title={memberId ? "Lead converted" : `Convert ${lead.fullName}`}
        description="Creates a gym member from this lead. Membership, invoice and trainer stay in their existing screens."
        actions={
          <ButtonLink href={`/crm/leads/${lead.id}`} variant="outline">
            Back to lead
          </ButtonLink>
        }
      />

      {memberId ? (
        <Card className="space-y-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-emerald-800">
            <CheckCircle2 aria-hidden="true" className="size-5" />
            {lead.fullName} is now a member. Continue without searching again.
          </p>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href={viewHref} size="sm">
              <Users aria-hidden="true" className="size-4" />
              View member
            </ButtonLink>
            {canAssignMembership && (
              <ButtonLink href={membershipHref} variant="outline" size="sm">
                <BadgeCheck aria-hidden="true" className="size-4" />
                Add membership
              </ButtonLink>
            )}
            {canCreateInvoice && (
              <ButtonLink href={invoiceHref} variant="outline" size="sm">
                <CreditCard aria-hidden="true" className="size-4" />
                Create invoice
              </ButtonLink>
            )}
            {canAssignTrainer && (
              <ButtonLink href={trainerHref} variant="outline" size="sm">
                <UserPlus aria-hidden="true" className="size-4" />
                Assign trainer
              </ButtonLink>
            )}
          </div>
        </Card>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6" noValidate>
          {!canConvert && (
            <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              You need CRM manage and member create permission to convert a lead.
            </div>
          )}
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">Lead details</h2>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Name</dt>
                <dd className="mt-0.5 text-sm text-ink">{lead.fullName}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Phone</dt>
                <dd className="mt-0.5 text-sm text-ink">{lead.phone || "—"}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Status</dt>
                <dd className="mt-0.5 text-sm text-ink">{lead.status}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Branch</dt>
                <dd className="mt-0.5 text-sm text-ink">{lead.branchName || "—"}</dd>
              </div>
            </dl>
          </Card>
          <Card className="space-y-4">
            <h2 className="text-sm font-semibold text-ink">Member fields</h2>
            <p className="text-sm text-neutral-500">
              Members require a last name and phone. Prefill from the lead, then save.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Branch" required error={errors.branchId}>
                <Select
                  options={branchOptions}
                  placeholder="Select a branch"
                  value={branchId}
                  invalid={Boolean(errors.branchId)}
                  onChange={(event) => setBranchId(event.target.value)}
                  disabled={!canConvert}
                />
              </FormField>
              <FormField label="Last name" required error={errors.lastName}>
                <Input
                  value={lastName}
                  invalid={Boolean(errors.lastName)}
                  onChange={(event) => setLastName(event.target.value)}
                  disabled={!canConvert}
                />
              </FormField>
              <FormField label="Phone" required error={errors.phone} className="sm:col-span-2">
                <Input
                  type="tel"
                  value={phone}
                  invalid={Boolean(errors.phone)}
                  onChange={(event) => setPhone(event.target.value)}
                  disabled={!canConvert}
                />
              </FormField>
            </div>
          </Card>
          <div className="flex flex-wrap justify-end gap-3">
            <ButtonLink href={`/crm/leads/${lead.id}`} variant="outline">
              Cancel
            </ButtonLink>
            <Button type="submit" isLoading={submitting} disabled={!canConvert || submitting}>
              Convert to member
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
