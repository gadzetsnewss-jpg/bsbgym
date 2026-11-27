"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus, Gift, Info, ShieldCheck, ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { loadMemberOptions, loadPlanOptions } from "@/lib/operations/adapters";
import { createComplimentaryMembership } from "@/lib/org/memberships";
import type { SelectOption } from "@/components/ui/select";

export function AddMembershipForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;

  const initialMemberId = searchParams.get("memberId") ?? "";
  const initialPlanId = searchParams.get("planId") ?? "";
  const initialBranchId = searchParams.get("branchId") ?? "";

  const [memberId, setMemberId] = React.useState(initialMemberId);
  const [planId, setPlanId] = React.useState(initialPlanId);
  const [branchId, setBranchId] = React.useState(initialBranchId || (branches[0]?.id ?? ""));
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [members, setMembers] = React.useState<SelectOption[]>([]);
  const [plans, setPlans] = React.useState<SelectOption[]>([]);
  const [saving, setSaving] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    if (!orgId) return;
    void loadMemberOptions(orgId).then(setMembers);
    void loadPlanOptions(orgId).then(setPlans);
  }, [orgId]);

  const invoiceParams = new URLSearchParams();
  if (memberId) invoiceParams.set("memberId", memberId);
  if (planId) invoiceParams.set("presetPlanId", planId);
  if (branchId) invoiceParams.set("branchId", branchId);
  const invoiceHref = `/billing/new-invoice${invoiceParams.toString() ? `?${invoiceParams.toString()}` : ""}`;

  const submitComplimentary = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;

    const nextErrors: Record<string, string> = {};
    if (!memberId) nextErrors.memberId = "Select a member.";
    if (!planId) nextErrors.planId = "Select a membership plan.";
    if (!branchId) nextErrors.branchId = "Select a branch.";
    if (!reason.trim()) nextErrors.reason = "An audit reason is required for complimentary membership assignment.";

    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      toast({ title: "Check required fields", variant: "error" });
      return;
    }

    setSaving(true);
    setErrors({});
    const result = await createComplimentaryMembership({
      organizationId: orgId,
      branchId,
      memberId,
      planId,
      startDate: startDate || null,
      endDate: endDate || null,
      reason: reason.trim(),
    });
    setSaving(false);

    if (result.error) {
      toast({ title: "Could not create membership", description: result.error.message, variant: "error" });
      return;
    }

    toast({ title: "Complimentary membership assigned", variant: "success" });
    router.push("/memberships/active");
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title="Add membership"
        description="FitForge unifies membership sales through New Invoice to maintain synchronized financial records."
      />

      {/* Primary Unified Workflow Recommendation */}
      <Card className="border-primary-200 bg-primary-50/70 p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3.5">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white shadow-sm">
              <FilePlus className="size-5" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-semibold text-primary-950">
                Sell Paid Membership via New Invoice
              </h2>
              <p className="text-sm text-primary-800 leading-relaxed max-w-xl">
                New Invoice is the primary workflow for selling memberships. It unifies member assignment,
                pricing, discounts, GST, payment collection, and installment schedules into a single transaction.
              </p>
            </div>
          </div>

          <div className="shrink-0 sm:self-center">
            <ButtonLink href={invoiceHref} size="lg" className="w-full sm:w-auto">
              <FilePlus className="size-4" />
              <span>Go to New Invoice</span>
              <ArrowRight className="size-4 ml-1" />
            </ButtonLink>
          </div>
        </div>
      </Card>

      {/* Secondary Complimentary / Free Assignment Section */}
      <Card className="p-6 space-y-6">
        <div className="flex items-start gap-3 border-b border-border pb-4">
          <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-700">
            <Gift className="size-4" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-ink">
              Complimentary or Promotional Membership (Non-Billed)
            </h3>
            <p className="mt-0.5 text-xs text-neutral-500">
              For $0 promotional, VIP complimentary, or staff trial passes only. No billing invoice is generated.
              A mandatory audit reason is logged with your owner account.
            </p>
          </div>
        </div>

        <form onSubmit={submitComplimentary} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Member" required error={errors.memberId}>
              <Select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                options={members.length ? members : [{ value: "", label: "Loading members…" }]}
              />
            </FormField>

            <FormField label="Membership plan" required error={errors.planId}>
              <Select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                options={plans.length ? plans : [{ value: "", label: "Loading plans…" }]}
              />
            </FormField>

            <FormField label="Branch" required error={errors.branchId}>
              <Select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                options={branches.map((b) => ({ value: b.id, label: b.name }))}
              />
            </FormField>

            <FormField label="Start date" hint="Defaults to today if left blank">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </FormField>

            <FormField label="End date" hint="Defaults to plan duration if left blank">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </FormField>
          </div>

          <FormField
            label="Audit reason for complimentary assignment"
            required
            error={errors.reason}
            hint="Strictly required: State why this member is receiving a complimentary membership without payment (e.g. VIP promotion, brand ambassador, staff trial)."
          >
            <Textarea
              rows={3}
              value={reason}
              placeholder="e.g. Approved by owner as brand ambassador promotional membership."
              onChange={(e) => setReason(e.target.value)}
            />
          </FormField>

          <div className="flex flex-wrap items-center justify-end gap-3 pt-3">
            <ButtonLink href="/memberships/active" variant="outline">
              Back to active memberships
            </ButtonLink>
            <Button type="submit" isLoading={saving}>
              <ShieldCheck className="size-4" />
              <span>Assign complimentary membership</span>
            </Button>
          </div>
        </form>
      </Card>
    </div>
  );
}
