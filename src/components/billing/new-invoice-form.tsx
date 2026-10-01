"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  BadgeCheck,
  CalendarPlus,
  CheckCircle2,
  FilePlus,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Trash2,
  User,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  createInvoice,
  fetchGstRates,
  fetchInvoice,
  fetchMemberForInvoice,
  fetchMembershipPlansForInvoice,
  recordPayment,
} from "@/lib/billing/client";
import {
  calculateInvoiceTotals,
  calculateLineGst,
  resolveSupplyKind,
  type TaxMode,
} from "@/lib/billing/gst";
import { loadMemberOptions } from "@/lib/operations/adapters";
import { createMembership, extendMembership } from "@/lib/org/memberships";
import { fetchOrganizationSetting, settingValueAsRecord } from "@/lib/org/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  INVOICE_ITEM_TYPES,
  INVOICE_ITEM_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/billing/types";
import {
  addDaysIso,
  addMonthsIso,
  computeBaseEndDate,
  daysBetweenIso,
  planItemDefaults,
  planOptionLabel,
  requiresMembershipPlan,
  showsPlanSelector,
  type InvoicePlanOption,
} from "@/lib/billing/plan-item";
import type { SelectOption } from "@/components/ui/select";
import type { InvoiceRow } from "@/lib/billing/types";

interface DraftItem {
  description: string;
  itemType: string;
  planId: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  hsnSac: string;
}

interface DraftPayment {
  key: string;
  method: string;
  amount: string;
  reference: string;
}

const emptyItem = (taxRate = "18", hsnSac = ""): DraftItem => ({
  description: "",
  itemType: "membership",
  planId: "",
  quantity: "1",
  unitPrice: "",
  discount: "0",
  taxRate,
  hsnSac,
});

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const presetMemberId = searchParams.get("memberId") ?? "";
  const presetMembershipId = searchParams.get("membershipId") ?? "";
  const presetPlanId = searchParams.get("planId") ?? "";
  const presetBranchId = searchParams.get("branchId") ?? "";
  const presetMemberName = searchParams.get("memberName") ?? "";

  const canCreateMembership = can("memberships.create");
  const canExtendMembership = can("memberships.update");

  const [members, setMembers] = React.useState<SelectOption[]>([]);
  const [plans, setPlans] = React.useState<InvoicePlanOption[]>([]);
  const [gstRates, setGstRates] = React.useState<{ name: string; rate: number; hsnSac: string | null; isDefault: boolean }[]>([]);
  const [taxModeSetting, setTaxModeSetting] = React.useState<TaxMode>("exclusive");
  const [memberId, setMemberId] = React.useState(presetMemberId);
  const [branchId, setBranchId] = React.useState(presetBranchId || currentBranchId || branches[0]?.id || "");
  const [issueDate, setIssueDate] = React.useState(todayIso());
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [placeOfSupply, setPlaceOfSupply] = React.useState(organization?.state ?? "");
  const [roundOff, setRoundOff] = React.useState("0");
  const [items, setItems] = React.useState<DraftItem[]>([emptyItem()]);
  const [payments, setPayments] = React.useState<DraftPayment[]>([
    { key: "p-1", method: "upi", amount: "", reference: "" },
  ]);
  const [membershipStart, setMembershipStart] = React.useState(todayIso());
  const [extraMonths, setExtraMonths] = React.useState("0");
  const [extraDays, setExtraDays] = React.useState("0");
  const [activateMembership, setActivateMembership] = React.useState(false);
  const [member, setMember] = React.useState<Awaited<ReturnType<typeof fetchMemberForInvoice>>["data"]>(null);
  const [saving, setSaving] = React.useState<"draft" | "finalize" | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = React.useState<Record<string, string>>({});
  const [success, setSuccess] = React.useState<{
    invoice: InvoiceRow;
    paid: number;
    balance: number;
    methods: string[];
    membershipWarning: string | null;
  } | null>(null);

  const paymentKeyRef = React.useRef(1);
  const paymentsDirty = React.useRef(false);
  const activateTouched = React.useRef(false);

  React.useEffect(() => {
    if (!orgId) return;
    void loadMemberOptions(orgId).then(setMembers);
    void fetchMembershipPlansForInvoice(orgId).then((result) => {
      if (result.error) {
        setLoadError(result.error.message);
        return;
      }
      setPlans(result.data ?? []);
    });
    void fetchGstRates(orgId).then((result) => {
      if (result.data) {
        setGstRates(result.data);
        const def = result.data.find((rate) => rate.isDefault) ?? result.data[0];
        if (def) {
          setItems((prev) =>
            prev.map((item) => ({
              ...item,
              taxRate: item.taxRate || String(def.rate),
              hsnSac: item.hsnSac || def.hsnSac || "",
            })),
          );
        }
      }
    });
    void fetchOrganizationSetting(orgId, "tax_gst").then((result) => {
      const record = settingValueAsRecord(result.data);
      setTaxModeSetting(record.taxMode === "inclusive" ? "inclusive" : "exclusive");
      const orgPlaceOfSupply = typeof record.placeOfSupply === "string" ? record.placeOfSupply : "";
      if (orgPlaceOfSupply) {
        setPlaceOfSupply((prev) => prev || orgPlaceOfSupply);
      }
    });
  }, [orgId]);

  React.useEffect(() => {
    if (!orgId || !memberId) {
      setMember(null);
      return;
    }
    void fetchMemberForInvoice(orgId, memberId, presetMembershipId || null).then((result) => {
      if (result.error) {
        setLoadError(result.error.message);
        return;
      }
      const next = result.data;
      setMember(next);
      if (next.branchId) setBranchId((prev) => prev || next.branchId);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, memberId, presetMembershipId]);

  // Carry a preset plan from the source action onto the first membership row.
  React.useEffect(() => {
    if (!presetPlanId || plans.length === 0) return;
    setItems((prev) => {
      if (prev.some((item) => item.planId)) return prev;
      const index = prev.findIndex((item) => showsPlanSelector(item.itemType));
      if (index < 0) return prev;
      const plan = plans.find((option) => option.id === presetPlanId);
      if (!plan) return prev;
      const defaults = planItemDefaults(plan);
      return prev.map((item, i) =>
        i === index
          ? { ...item, planId: plan.id, description: item.description || defaults.description, unitPrice: item.unitPrice || defaults.unitPrice }
          : item,
      );
    });
  }, [presetPlanId, plans]);

  const supply = resolveSupplyKind(organization?.state, placeOfSupply);
  const computed = items.map((item) =>
    calculateLineGst({
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      discount: Number(item.discount) || 0,
      taxRate: Number(item.taxRate) || 0,
      taxMode: taxModeSetting,
      supply,
    }),
  );
  const totals = calculateInvoiceTotals(computed, Number(roundOff) || 0);

  const paymentTotal = React.useMemo(
    () => payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0),
    [payments],
  );
  const remaining = Math.max(totals.grandTotal - paymentTotal, 0);

  // Keep a single untouched payment row in sync with the invoice total.
  React.useEffect(() => {
    if (paymentsDirty.current) return;
    setPayments((prev) =>
      prev.length === 1
        ? [{ ...prev[0], amount: totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : "" }]
        : prev,
    );
  }, [totals.grandTotal]);

  const defaultGst = gstRates.find((rate) => rate.isDefault) ?? gstRates[0];

  const membershipItem = items.find((item) => requiresMembershipPlan(item.itemType) && item.planId);
  const validityPlan = membershipItem ? plans.find((plan) => plan.id === membershipItem.planId) : undefined;
  const activeMembership = member?.membership ?? null;
  const extendsActive = Boolean(activeMembership && validityPlan);
  const activePlanDuration = activeMembership?.planId
    ? plans.find((plan) => plan.id === activeMembership.planId)?.durationDays
    : undefined;

  const months = Math.max(0, Number(extraMonths) || 0);
  const days = Math.max(0, Number(extraDays) || 0);

  const baseValidUntil = validityPlan
    ? extendsActive && activeMembership
      ? activeMembership.endDate
      : computeBaseEndDate(membershipStart, validityPlan.durationDays)
    : "";
  const validUntil = validityPlan
    ? addDaysIso(addMonthsIso(baseValidUntil, months), days)
    : "";
  const meaningfulExtra = months > 0 || days > 0;

  React.useEffect(() => {
    if (activateTouched.current) return;
    setActivateMembership(Boolean(validityPlan && !activeMembership && canCreateMembership));
  }, [validityPlan, activeMembership, canCreateMembership]);

  const applyPlanToItem = (item: DraftItem, planId: string): DraftItem => {
    const plan = plans.find((option) => option.id === planId);
    if (!plan) return { ...item, planId };
    const defaults = planItemDefaults(plan);
    const gstMatch =
      plan.taxRate > 0
        ? gstRates.find((rate) => rate.rate === plan.taxRate) ??
          gstRates.find((rate) => String(rate.rate) === defaults.taxRate)
        : undefined;
    const taxRate = gstMatch
      ? String(gstMatch.rate)
      : defaults.taxRate || item.taxRate || (defaultGst ? String(defaultGst.rate) : item.taxRate);
    return {
      ...item,
      planId,
      description: defaults.description,
      unitPrice: defaults.unitPrice,
      taxRate,
      hsnSac: item.hsnSac || gstMatch?.hsnSac || item.hsnSac,
    };
  };

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setFieldErrors((prev) => {
      const next = { ...prev };
      for (const key of Object.keys(patch)) delete next[`item.${index}.${key}`];
      return next;
    });
    setItems((prev) =>
      prev.map((item, i) => {
        if (i !== index) return item;
        let next = { ...item, ...patch };
        if (patch.planId !== undefined) next = applyPlanToItem(next, patch.planId);
        if (patch.itemType && !showsPlanSelector(patch.itemType)) {
          next = { ...next, planId: "" };
        }
        return next;
      }),
    );
  };

  const updatePayment = (key: string, patch: Partial<DraftPayment>) => {
    paymentsDirty.current = true;
    setPayments((prev) => prev.map((payment) => (payment.key === key ? { ...payment, ...patch } : payment)));
  };

  const addPayment = () => {
    paymentsDirty.current = true;
    paymentKeyRef.current += 1;
    setPayments((prev) => [
      ...prev,
      { key: `p-${paymentKeyRef.current}`, method: "cash", amount: "", reference: "" },
    ]);
  };

  const removePayment = (key: string) => {
    paymentsDirty.current = true;
    setPayments((prev) => (prev.length > 1 ? prev.filter((payment) => payment.key !== key) : prev));
  };

  const validate = (mode: "draft" | "finalize"): boolean => {
    const nextErrors: Record<string, string> = {};
    if (!memberId) nextErrors.memberId = "Select a member.";
    if (!branchId) nextErrors.branchId = "Select a branch.";
    items.forEach((item, index) => {
      if (!item.description.trim()) nextErrors[`item.${index}.description`] = "Description is required.";
      if (requiresMembershipPlan(item.itemType) && !item.planId) {
        nextErrors[`item.${index}.planId`] = "Select a membership plan.";
      }
      const quantity = Number(item.quantity);
      if (!Number.isFinite(quantity) || quantity <= 0) {
        nextErrors[`item.${index}.quantity`] = "Quantity must be greater than zero.";
      }
      const unitPrice = Number(item.unitPrice);
      if (item.unitPrice.trim() === "" || !Number.isFinite(unitPrice) || unitPrice < 0) {
        nextErrors[`item.${index}.unitPrice`] = "Rate must be a valid amount.";
      }
      const discount = Number(item.discount);
      if (!Number.isFinite(discount) || discount < 0) {
        nextErrors[`item.${index}.discount`] = "Discount cannot be negative.";
      }
      if (Number.isFinite(quantity) && Number.isFinite(unitPrice) && Number.isFinite(discount)) {
        if (discount > quantity * unitPrice) {
          nextErrors[`item.${index}.discount`] = "Discount cannot exceed the line amount.";
        }
      }
    });
    if (computed.every((line) => line.lineTotal <= 0) && !nextErrors["item.0.unitPrice"]) {
      nextErrors.items = "Add at least one invoice item with a valid amount.";
    }
    if (activateMembership && validityPlan && !activeMembership && !membershipStart) {
      nextErrors.membershipStart = "Select a membership start date.";
    }
    if (mode === "finalize") {
      if (!can("payments.create")) {
        nextErrors.payments = "You do not have permission to record payments.";
      } else if (paymentTotal <= 0) {
        nextErrors.payments = "Enter a payment before finalizing. Use Save draft to keep it unpaid.";
      } else if (paymentTotal > totals.grandTotal + 0.001) {
        nextErrors.payments = "Payments cannot exceed the invoice total.";
      }
      payments.forEach((payment, index) => {
        const amount = Number(payment.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
          nextErrors[`payment.${index}.amount`] = "Enter an amount greater than zero.";
        }
      });
    }
    setFieldErrors(nextErrors);
    return Object.keys(nextErrors).length === 0;
  };

  const resetForm = () => {
    setItems([emptyItem()]);
    setPayments([{ key: "p-1", method: "upi", amount: "", reference: "" }]);
    paymentKeyRef.current = 1;
    paymentsDirty.current = false;
    activateTouched.current = false;
    setExtraMonths("0");
    setExtraDays("0");
    setActivateMembership(false);
    setFieldErrors({});
    setSuccess(null);
    router.replace("/billing/new-invoice");
  };

  const submit = async (mode: "draft" | "finalize") => {
    if (!orgId) return;
    if (!validate(mode)) {
      toast({ title: "Check the highlighted fields", variant: "error" });
      return;
    }
    setSaving(mode);
    const result = await createInvoice({
      organizationId: orgId,
      branchId,
      memberId,
      membershipId: member?.membership?.id ?? (presetMembershipId || null),
      issueDate,
      dueDate: dueDate || null,
      notes,
      placeOfSupply,
      taxMode: taxModeSetting,
      roundOff: Number(roundOff) || 0,
      issue: mode === "finalize",
      items: items.map((item) => ({
        description: item.description,
        itemType: item.itemType,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        taxRate: Number(item.taxRate) || 0,
        hsnSac: item.hsnSac.trim() || null,
        planId: item.planId || null,
      })),
    });
    if (result.error) {
      setSaving(null);
      toast({ title: "Could not create invoice", description: result.error.message, variant: "error" });
      return;
    }
    const invoiceId = result.data.id;

    if (mode === "draft") {
      setSaving(null);
      toast({ title: "Draft saved", variant: "success" });
      router.push(`/billing/invoices/${invoiceId}`);
      return;
    }

    const methods: string[] = [];
    for (const payment of payments) {
      const amount = Number(payment.amount) || 0;
      if (amount <= 0) continue;
      const paid = await recordPayment({
        organizationId: orgId,
        invoiceId,
        amount,
        method: payment.method,
        reference: payment.reference,
      });
      if (paid.error) {
        setSaving(null);
        toast({
          title: "Invoice created, payment failed",
          description: paid.error.message,
          variant: "error",
        });
        router.push(`/billing/invoices/${invoiceId}`);
        return;
      }
      methods.push(payment.method);
    }

    let membershipWarning: string | null = null;
    if (validityPlan && activateMembership) {
      if (activeMembership && canExtendMembership) {
        const extendBy = daysBetweenIso(activeMembership.endDate, validUntil);
        if (extendBy > 0) {
          const extended = await extendMembership(
            activeMembership.id,
            extendBy,
            "Extra validity from invoice",
          );
          if (extended.error) membershipWarning = extended.error.message;
        }
      } else if (!activeMembership && canCreateMembership) {
        const created = await createMembership({
          organizationId: orgId,
          branchId,
          memberId,
          planId: validityPlan.id,
          startDate: membershipStart,
          endDate: validUntil,
          price: validityPlan.price,
          discount: 0,
          notes: "Created from invoice",
        });
        if (created.error) membershipWarning = created.error.message;
      }
    }

    const invoiceResult = await fetchInvoice(orgId, invoiceId);
    const paymentTotalRounded = Math.min(paymentTotal, totals.grandTotal);
    const invoice: InvoiceRow =
      invoiceResult.data ??
      ({
        id: invoiceId,
        organizationId: orgId,
        branchId,
        branchName: "",
        memberId,
        memberName: member?.fullName ?? presetMemberName,
        memberCode: member?.code ?? null,
        memberPhone: member?.phone ?? null,
        memberEmail: member?.email ?? null,
        memberAddress: member?.address ?? null,
        membershipId: member?.membership?.id ?? null,
        invoiceNumber: "",
        status: "issued",
        issueDate,
        dueDate: dueDate || null,
        subTotal: totals.subTotal,
        discount: totals.discount,
        taxTotal: totals.taxTotal,
        cgst: totals.cgst,
        sgst: totals.sgst,
        igst: totals.igst,
        roundOff: totals.roundOff,
        total: totals.grandTotal,
        amountPaid: paymentTotalRounded,
        amountCredited: 0,
        balance: Math.max(totals.grandTotal - paymentTotalRounded, 0),
        notes: notes || null,
        placeOfSupply: placeOfSupply || null,
        taxMode: taxModeSetting,
        createdAt: new Date().toISOString(),
      } as InvoiceRow);

    setSaving(null);
    setSuccess({
      invoice,
      paid: invoice.amountPaid,
      balance: invoice.balance,
      methods,
      membershipWarning,
    });
    toast({ title: "Invoice created successfully", variant: "success" });
  };

  if (!can("billing.create")) {
    return <ErrorState description="You do not have permission to create invoices." />;
  }
  if (!orgId) return <LoadingState label="Loading organization…" />;

  if (success) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Invoice created successfully"
          description="The invoice and payment are saved."
          icon={CheckCircle2}
          actions={
            <Button variant="outline" onClick={resetForm}>
              <RotateCcw aria-hidden="true" className="size-4" />
              Create another invoice
            </Button>
          }
        />

        {success.membershipWarning && (
          <ErrorState
            title="Membership not updated"
            description={`The invoice was saved, but the membership change failed: ${success.membershipWarning}`}
          />
        )}

        <Card className="space-y-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-neutral-500">Invoice number</span>
            <span className="font-medium text-ink">{success.invoice.invoiceNumber || "—"}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Total</span>
            <span className="tabular-nums font-medium">{formatCurrency(success.invoice.total, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Paid</span>
            <span className="tabular-nums">{formatCurrency(success.paid, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Balance</span>
            <span className="tabular-nums">{formatCurrency(success.balance, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-neutral-500">Payment method(s)</span>
            <span>
              {success.methods.length
                ? success.methods.map((method) => PAYMENT_METHOD_LABELS[method] ?? method).join(", ")
                : "—"}
            </span>
          </div>
        </Card>

        <div className="flex flex-wrap gap-2">
          <ButtonLink href={`/billing/invoices/${success.invoice.id}/print`} variant="outline">
            <Printer aria-hidden="true" className="size-4" />
            Print invoice
          </ButtonLink>
          <ButtonLink href={`/billing/invoices/${success.invoice.id}`} variant="outline">
            <Receipt aria-hidden="true" className="size-4" />
            View invoice
          </ButtonLink>
          {memberId && (
            <ButtonLink href={`/members/${memberId}`} variant="outline">
              <User aria-hidden="true" className="size-4" />
              View member
            </ButtonLink>
          )}
          {success.balance > 0 && (
            <ButtonLink href={`/billing/invoices/${success.invoice.id}`}>
              Record another payment
            </ButtonLink>
          )}
          <Button onClick={resetForm}>
            <FilePlus aria-hidden="true" className="size-4" />
            Create another invoice
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New invoice"
        description="Member → Plan → Membership validity → Payment. Everything is saved to Supabase."
        icon={FilePlus}
        actions={<ButtonLink href="/billing/invoices" variant="outline">Back to invoices</ButtonLink>}
      />

      {loadError && <ErrorState description={loadError} />}

      <FormSection title="1. Invoice details" columns={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Invoice number" hint="Assigned automatically on save">
            <Input value="Auto" disabled />
          </FormField>
          <FormField label="Invoice date" required>
            <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </FormField>
          <FormField label="Invoice payment due date" hint="Separate from membership expiry">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="2. Customer" columns={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Member" required error={fieldErrors.memberId}>
            <Select
              value={memberId}
              placeholder="Search / select a member"
              invalid={Boolean(fieldErrors.memberId)}
              onChange={(event) => {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.memberId;
                  return next;
                });
                setMemberId(event.target.value);
              }}
              options={members}
            />
          </FormField>
          <FormField label="Branch" required error={fieldErrors.branchId}>
            <Select
              value={branchId}
              invalid={Boolean(fieldErrors.branchId)}
              onChange={(event) => {
                setFieldErrors((prev) => {
                  const next = { ...prev };
                  delete next.branchId;
                  return next;
                });
                setBranchId(event.target.value);
              }}
              options={branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` }))}
            />
          </FormField>
        </div>
        {member && (
          <dl className="mt-4 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Member code</dt>
              <dd className="text-ink">{member.code}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Phone</dt>
              <dd className="text-ink">{member.phone}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Email</dt>
              <dd className="text-ink">{member.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Address</dt>
              <dd className="text-ink">{member.address ?? "—"}</dd>
            </div>
          </dl>
        )}
      </FormSection>

      <FormSection title="3. Membership" columns={1}>
        {member?.membership ? (
          <div className="space-y-3">
            <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Current plan</dt>
                <dd className="text-ink">{member.membership.planName}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Membership ID</dt>
                <dd className="text-ink" title={member.membership.id}>
                  {member.membership.id.slice(0, 8)}…
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Status</dt>
                <dd className="text-ink">{member.membership.status}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Start</dt>
                <dd className="text-ink">{formatDate(member.membership.startDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Base duration</dt>
                <dd className="text-ink">{activePlanDuration ? `${activePlanDuration} days` : "—"}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Membership valid until</dt>
                <dd className="text-ink">{formatDate(member.membership.endDate)}</dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Branch</dt>
                <dd className="text-ink">{branches.find((branch) => branch.id === member.branchId)?.name ?? "—"}</dd>
              </div>
            </dl>
            <div className="flex flex-wrap gap-2">
              <ButtonLink href={`/memberships/active/${member.membership.id}`} variant="outline" size="sm">
                View membership
              </ButtonLink>
              <ButtonLink href={`/memberships/active/add?memberId=${memberId}`} variant="outline" size="sm">
                Create new membership
              </ButtonLink>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-neutral-500">
              No active membership on this member. Select a Membership Plan below to charge a new membership, or create one first.
            </p>
            {memberId && (
              <ButtonLink href={`/memberships/active/add?memberId=${memberId}`} variant="outline" size="sm">
                Create new membership
              </ButtonLink>
            )}
          </div>
        )}

        {validityPlan && (
          <div className="mt-4 rounded-card border border-border bg-surface p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-ink">
              <CalendarPlus aria-hidden="true" className="size-4" />
              Membership validity
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              {!extendsActive && (
                <FormField label="Start date" required error={fieldErrors.membershipStart}>
                  <Input
                    type="date"
                    value={membershipStart}
                    invalid={Boolean(fieldErrors.membershipStart)}
                    onChange={(event) => setMembershipStart(event.target.value)}
                  />
                </FormField>
              )}
              <FormField label="Plan duration">
                <Input value={`${validityPlan.durationDays} days`} disabled />
              </FormField>
              <FormField label="Extra validity (months)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={extraMonths}
                  onChange={(event) => setExtraMonths(event.target.value)}
                />
              </FormField>
              <FormField label="Extra validity (days)">
                <Input
                  type="number"
                  min={0}
                  step={1}
                  value={extraDays}
                  onChange={(event) => setExtraDays(event.target.value)}
                />
              </FormField>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Extra validity</dt>
                <dd className="text-ink">
                  {meaningfulExtra ? `+${months} month(s), +${days} day(s)` : "None"}
                </dd>
              </div>
              <div>
                <dt className="text-xs text-neutral-500 uppercase">Membership valid until</dt>
                <dd className="font-medium text-ink">{formatDate(validUntil)}</dd>
              </div>
            </div>
            <label className="mt-3 flex items-center gap-2 text-sm text-ink">
              <input
                type="checkbox"
                checked={activateMembership}
                onChange={(event) => {
                  activateTouched.current = true;
                  setActivateMembership(event.target.checked);
                }}
                disabled={activeMembership ? !canExtendMembership : !canCreateMembership}
              />
              <span>
                {activeMembership
                  ? "Extend the current membership by the extra validity"
                  : "Create this membership when the invoice is saved"}
              </span>
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Selecting a plan only fills this invoice line. The membership is created or extended only when the box above is ticked.
            </p>
          </div>
        )}
      </FormSection>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">4. Invoice items</h2>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              const def = gstRates.find((rate) => rate.isDefault) ?? gstRates[0];
              setItems((prev) => [...prev, emptyItem(def?.rate.toString() ?? "18", def?.hsnSac ?? "")]);
            }}
          >
            <Plus aria-hidden="true" className="size-4" />
            Add item
          </Button>
        </div>
        {fieldErrors.items ? (
          <p role="alert" className="text-xs font-medium text-red-600">{fieldErrors.items}</p>
        ) : null}
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="pb-2">Description</th>
                <th className="pb-2">Type</th>
                <th className="pb-2">Membership plan</th>
                <th className="pb-2">HSN / SAC</th>
                <th className="pb-2">Qty</th>
                <th className="pb-2">Rate</th>
                <th className="pb-2">Discount</th>
                <th className="pb-2">GST %</th>
                <th className="pb-2 text-right">Total</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((item, index) => {
                const gstOptions = gstRates.length
                  ? gstRates.map((rate) => ({ value: String(rate.rate), label: `${rate.name} (${rate.rate}%)` }))
                  : [
                      { value: "0", label: "0%" },
                      { value: "5", label: "5%" },
                      { value: "12", label: "12%" },
                      { value: "18", label: "18%" },
                      { value: "28", label: "28%" },
                    ];
                if (item.taxRate && !gstOptions.some((option) => option.value === item.taxRate)) {
                  gstOptions.unshift({ value: item.taxRate, label: `${item.taxRate}%` });
                }
                return (
                  <tr key={index} className="align-top">
                    <td className="py-2 pr-2 min-w-40">
                      <Input
                        value={item.description}
                        invalid={Boolean(fieldErrors[`item.${index}.description`])}
                        onChange={(event) => updateItem(index, { description: event.target.value })}
                      />
                      {fieldErrors[`item.${index}.description`] ? (
                        <p role="alert" className="mt-1 text-xs font-medium text-red-600">{fieldErrors[`item.${index}.description`]}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 w-40">
                      <Select
                        value={item.itemType}
                        onChange={(event) => updateItem(index, { itemType: event.target.value })}
                        options={INVOICE_ITEM_TYPES.map((type) => ({ value: type, label: INVOICE_ITEM_TYPE_LABELS[type] }))}
                      />
                    </td>
                    <td className="py-2 pr-2 min-w-52">
                      {showsPlanSelector(item.itemType) ? (
                        <>
                          <Select
                            value={item.planId}
                            placeholder={plans.length ? "Select a membership plan" : "No active plans"}
                            invalid={Boolean(fieldErrors[`item.${index}.planId`])}
                            onChange={(event) => updateItem(index, { planId: event.target.value })}
                            options={plans.map((plan) => ({
                              value: plan.id,
                              label: planOptionLabel(plan, (value) => formatCurrency(value, currency)),
                            }))}
                          />
                          {fieldErrors[`item.${index}.planId`] ? (
                            <p role="alert" className="mt-1 text-xs font-medium text-red-600">{fieldErrors[`item.${index}.planId`]}</p>
                          ) : null}
                        </>
                      ) : (
                        <span className="block h-10 text-sm text-neutral-400">—</span>
                      )}
                    </td>
                    <td className="py-2 pr-2 w-28">
                      <Input
                        value={item.hsnSac}
                        maxLength={20}
                        onChange={(event) => updateItem(index, { hsnSac: event.target.value })}
                      />
                    </td>
                    <td className="py-2 pr-2 w-20">
                      <Input
                        type="number"
                        min={0.001}
                        step={0.001}
                        value={item.quantity}
                        invalid={Boolean(fieldErrors[`item.${index}.quantity`])}
                        onChange={(event) => updateItem(index, { quantity: event.target.value })}
                      />
                      {fieldErrors[`item.${index}.quantity`] ? (
                        <p role="alert" className="mt-1 text-xs font-medium text-red-600">{fieldErrors[`item.${index}.quantity`]}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 w-28">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.unitPrice}
                        invalid={Boolean(fieldErrors[`item.${index}.unitPrice`])}
                        onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                      />
                      {fieldErrors[`item.${index}.unitPrice`] ? (
                        <p role="alert" className="mt-1 text-xs font-medium text-red-600">{fieldErrors[`item.${index}.unitPrice`]}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 w-24">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={item.discount}
                        invalid={Boolean(fieldErrors[`item.${index}.discount`])}
                        onChange={(event) => updateItem(index, { discount: event.target.value })}
                      />
                      {fieldErrors[`item.${index}.discount`] ? (
                        <p role="alert" className="mt-1 text-xs font-medium text-red-600">{fieldErrors[`item.${index}.discount`]}</p>
                      ) : null}
                    </td>
                    <td className="py-2 pr-2 w-24">
                      <Select
                        value={item.taxRate}
                        onChange={(event) => {
                          const nextRate = event.target.value;
                          const match = gstRates.find((rate) => String(rate.rate) === nextRate);
                          updateItem(index, {
                            taxRate: nextRate,
                            hsnSac: item.hsnSac || match?.hsnSac || "",
                          });
                        }}
                        options={gstOptions}
                      />
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums">{formatCurrency(computed[index]?.lineTotal ?? 0, currency)}</td>
                    <td className="py-2">
                      {items.length > 1 && (
                        <Button type="button" variant="ghost" size="icon" onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}>
                          <Trash2 aria-hidden="true" className="size-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <FormSection title="5. Tax / additional details" columns={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Place of supply">
            <Input value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} />
          </FormField>
          <FormField label="Round off">
            <Input type="number" step={0.01} value={roundOff} onChange={(event) => setRoundOff(event.target.value)} />
          </FormField>
          <FormField label="Tax mode" hint="Configured in Tax / GST settings">
            <Input value={taxModeSetting === "inclusive" ? "Tax inclusive" : "Tax exclusive"} disabled />
          </FormField>
        </div>
        <FormField label="Notes">
          <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
        </FormField>
      </FormSection>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">6. Payment</h2>
          <Button type="button" variant="outline" size="sm" onClick={addPayment}>
            <Plus aria-hidden="true" className="size-4" />
            Add payment method
          </Button>
        </div>
        <p className="text-sm text-neutral-500">
          A finalized invoice requires a payment. Use Save draft to keep an unpaid invoice.
        </p>
        {fieldErrors.payments ? (
          <p role="alert" className="text-xs font-medium text-red-600">{fieldErrors.payments}</p>
        ) : null}
        <div className="space-y-3">
          {payments.map((payment, index) => (
            <div key={payment.key} className="grid grid-cols-1 gap-3 sm:grid-cols-12">
              <div className="sm:col-span-4">
                <FormField label="Payment method" required>
                  <Select
                    value={payment.method}
                    onChange={(event) => updatePayment(payment.key, { method: event.target.value })}
                    options={PAYMENT_METHODS.map((item) => ({ value: item, label: PAYMENT_METHOD_LABELS[item] }))}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Amount" required error={fieldErrors[`payment.${index}.amount`]}>
                  <Input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={payment.amount}
                    invalid={Boolean(fieldErrors[`payment.${index}.amount`])}
                    onChange={(event) => updatePayment(payment.key, { amount: event.target.value })}
                  />
                </FormField>
              </div>
              <div className="sm:col-span-3">
                <FormField label="Reference">
                  <Input
                    value={payment.reference}
                    placeholder="UPI / UTR / cheque no."
                    onChange={(event) => updatePayment(payment.key, { reference: event.target.value })}
                  />
                </FormField>
              </div>
              <div className="flex items-end sm:col-span-2">
                {payments.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => removePayment(payment.key)}>
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                )}
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
          <div className="flex justify-between sm:block">
            <span className="text-neutral-500">Invoice total</span>
            <span className="block tabular-nums font-medium">{formatCurrency(totals.grandTotal, currency)}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-neutral-500">Total received</span>
            <span className="block tabular-nums font-medium">{formatCurrency(paymentTotal, currency)}</span>
          </div>
          <div className="flex justify-between sm:block">
            <span className="text-neutral-500">Remaining</span>
            <span className="block tabular-nums font-medium">{formatCurrency(remaining, currency)}</span>
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">7. Summary</h2>
          <div className="flex justify-between"><span>Member</span><span>{member?.fullName ?? "—"}</span></div>
          <div className="flex justify-between"><span>Plan</span><span>{validityPlan?.name ?? "—"}</span></div>
          <div className="flex justify-between"><span>Membership valid until</span><span>{validityPlan ? formatDate(validUntil) : "—"}</span></div>
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(totals.subTotal, currency)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{formatCurrency(totals.discount, currency)}</span></div>
          <div className="flex justify-between"><span>Taxable</span><span className="tabular-nums">{formatCurrency(totals.taxableAmount, currency)}</span></div>
          <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{formatCurrency(totals.cgst, currency)}</span></div>
          <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">{formatCurrency(totals.sgst, currency)}</span></div>
          <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{formatCurrency(totals.igst, currency)}</span></div>
          <div className="flex justify-between"><span>Round off</span><span className="tabular-nums">{formatCurrency(totals.roundOff, currency)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Grand total</span><span className="tabular-nums">{formatCurrency(totals.grandTotal, currency)}</span></div>
        </Card>

        <Card className="space-y-3 text-sm">
          <h2 className="text-sm font-semibold text-ink">8. Final actions</h2>
          <p className="text-neutral-500">
            {paymentTotal > 0
              ? `Recording ${formatCurrency(paymentTotal, currency)}. Remaining ${formatCurrency(remaining, currency)}.`
              : "Enter a payment to finalize, or save a draft."}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => void submit("finalize")}
              isLoading={saving === "finalize"}
              disabled={Boolean(saving)}
            >
              <BadgeCheck aria-hidden="true" className="size-4" />
              Create invoice & record payment
            </Button>
            <Button
              variant="outline"
              onClick={() => void submit("draft")}
              isLoading={saving === "draft"}
              disabled={Boolean(saving)}
            >
              Save draft
            </Button>
          </div>
        </Card>
      </div>
    </div>
  );
}
