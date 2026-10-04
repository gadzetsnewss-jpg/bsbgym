"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  BadgeCheck,
  Calculator,
  CalendarClock,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CreditCard,
  FilePlus,
  FileText,
  Home,
  ListPlus,
  Plus,
  Printer,
  Receipt,
  RotateCcw,
  Search,
  Trash2,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
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
  recordPayments,
} from "@/lib/billing/client";
import {
  calculateInvoiceTotals,
  calculateLineGst,
  resolveSupplyKind,
  roundMoney,
  type TaxMode,
} from "@/lib/billing/gst";
import { collectPaymentRows, paymentRowsTotal } from "@/lib/billing/payments";
import { loadMemberOptions } from "@/lib/operations/adapters";
import { createMembership, extendMembership } from "@/lib/org/memberships";
import { fetchOrganizationSetting, settingValueAsRecord } from "@/lib/org/settings";
import { formatCurrency, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
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

function initialsOf(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "M"
  );
}

function StepCard({
  step,
  title,
  description,
  icon: Icon,
  actions,
  tone = "default",
  className,
  children,
}: {
  step: number;
  title: string;
  description?: string;
  icon: LucideIcon;
  actions?: React.ReactNode;
  tone?: "default" | "success";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-card border bg-surface p-5 shadow-card",
        tone === "success" ? "border-emerald-200" : "border-border",
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "flex size-9 shrink-0 items-center justify-center rounded-xl text-white shadow-card",
              tone === "success"
                ? "bg-gradient-to-br from-emerald-500 to-primary-600"
                : "bg-gradient-to-br from-primary-600 to-accent-500",
            )}
          >
            <Icon aria-hidden="true" className="size-5" />
          </span>
          <div className="min-w-0">
            <p className="text-[11px] font-semibold tracking-wider text-primary-600 uppercase">
              Step {step}
            </p>
            <h2 className="text-base font-semibold tracking-tight text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-sm text-neutral-500">{description}</p>}
          </div>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function InfoTile({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">{label}</dt>
      <dd className="mt-0.5 truncate text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}

function ItemCell({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("min-w-0", className)}>
      <label className="mb-1 block text-[11px] font-medium text-neutral-500 lg:hidden">{label}</label>
      {children}
    </div>
  );
}

const ITEMS_GRID =
  "lg:grid-cols-[1.75rem_minmax(0,3fr)_minmax(0,1.5fr)_minmax(0,2fr)_4.5rem_6rem_6rem_5.5rem_7rem_2.5rem]";

function PlanPicker({
  value,
  options,
  currency,
  invalid,
  onChange,
  placeholder,
}: {
  value: string;
  options: InvoicePlanOption[];
  currency: string;
  invalid?: boolean;
  onChange: (planId: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const containerRef = React.useRef<HTMLDivElement>(null);
  const selected = options.find((option) => option.id === value);

  React.useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const normalized = query.trim().toLowerCase();
  const filtered = normalized
    ? options.filter((option) => `${option.name} ${option.code}`.toLowerCase().includes(normalized))
    : options;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          "flex h-10 w-full items-center justify-between gap-2 rounded-lg border bg-white px-3 text-left text-sm shadow-card transition-colors",
          "focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25 focus-visible:outline-none",
          invalid ? "border-red-400" : "border-border",
        )}
      >
        <span className={cn("truncate", selected ? "text-ink" : "text-neutral-400")}>
          {selected ? planOptionLabel(selected, (amount) => formatCurrency(amount, currency)) : placeholder}
        </span>
        <ChevronDown
          aria-hidden="true"
          className={cn("size-4 shrink-0 text-neutral-400 transition-transform", open && "rotate-180")}
        />
      </button>
      {open && (
        <div
          role="listbox"
          className="absolute left-0 z-40 mt-1 w-72 rounded-lg border border-border bg-white p-2 shadow-pop"
        >
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-neutral-400"
            />
            <Input
              autoFocus
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search plans"
              className="h-8 pl-8 text-sm"
            />
          </div>
          <div className="mt-2 max-h-56 overflow-y-auto">
            {filtered.length === 0 ? (
              <p className="px-2 py-3 text-center text-xs text-neutral-500">No plans found</p>
            ) : (
              filtered.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  role="option"
                  aria-selected={option.id === value}
                  onClick={() => {
                    onChange(option.id);
                    setOpen(false);
                    setQuery("");
                  }}
                  className={cn(
                    "flex w-full flex-col items-start gap-0.5 rounded-md px-2.5 py-2 text-left text-sm transition-colors hover:bg-primary-50",
                    option.id === value && "bg-primary-50",
                  )}
                >
                  <span className="w-full truncate font-medium text-ink">
                    {option.name}
                    {option.code ? ` (${option.code})` : ""}
                  </span>
                  <span className="text-xs text-neutral-500">
                    {option.durationDays} days · {formatCurrency(option.price, currency)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
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
  const [paymentReceived, setPaymentReceived] = React.useState(true);
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
    () => roundMoney(payments.reduce((sum, payment) => sum + (Number(payment.amount) || 0), 0)),
    [payments],
  );
  const remaining = Math.max(totals.grandTotal - paymentTotal, 0);

  // Keep a single untouched payment row in sync with the invoice total.
  React.useEffect(() => {
    if (!paymentReceived) return;
    if (paymentsDirty.current) return;
    setPayments((prev) =>
      prev.length === 1
        ? [{ ...prev[0], amount: totals.grandTotal > 0 ? totals.grandTotal.toFixed(2) : "" }]
        : prev,
    );
  }, [totals.grandTotal, paymentReceived]);

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

  const togglePaymentReceived = (checked: boolean) => {
    setPaymentReceived(checked);
    if (!checked) {
      paymentsDirty.current = true;
      setPayments((prev) => prev.map((payment) => ({ ...payment, amount: "" })));
    } else {
      paymentsDirty.current = false;
    }
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
      } else if (!paymentReceived) {
        nextErrors.payments = "Tick Payment received to finalize, or use Save draft.";
      } else if (paymentTotal <= 0) {
        nextErrors.payments = "Enter a payment before finalizing. Use Save draft to keep it unpaid.";
      } else if (paymentTotal > totals.grandTotal + 0.001) {
        nextErrors.payments = "Payments cannot exceed the invoice total.";
      }
      if (paymentReceived) {
        payments.forEach((payment, index) => {
          const amount = Number(payment.amount);
          if (!Number.isFinite(amount) || amount <= 0) {
            nextErrors[`payment.${index}.amount`] = "Enter an amount greater than zero.";
          }
          if (!PAYMENT_METHODS.includes(payment.method as (typeof PAYMENT_METHODS)[number])) {
            nextErrors[`payment.${index}.method`] = "Select a valid payment method.";
          }
        });
      }
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
    setPaymentReceived(true);
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

    const paymentRows = collectPaymentRows(payments);
    const methods = paymentRows.map((payment) => payment.method);

    if (paymentRows.length > 0) {
      const paid = await recordPayments({
        organizationId: orgId,
        invoiceId,
        payments: paymentRows,
      });
      if (paid.error) {
        setSaving(null);
        toast({
          title: "Invoice created, payments failed",
          description: paid.error.message,
          variant: "error",
        });
        router.push(`/billing/invoices/${invoiceId}`);
        return;
      }
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
    const paymentTotalRounded = Math.min(paymentRowsTotal(paymentRows), totals.grandTotal);
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

  const currentBranch = branches.find((branch) => branch.id === branchId);
  const memberBranch = branches.find((branch) => branch.id === member?.branchId);

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-medium text-neutral-500">
          <Link href="/dashboard" className="inline-flex items-center gap-1 transition-colors hover:text-primary-700">
            <Home aria-hidden="true" className="size-3.5" />
            Home
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-neutral-300" />
          <Link href="/billing/invoices" className="transition-colors hover:text-primary-700">
            Billing
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-neutral-300" />
          <span className="text-ink">New invoice</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-ink">New invoice</h1>
            <p className="mt-1 text-sm text-neutral-500">Create and collect a gym invoice in one workflow.</p>
          </div>
          <ButtonLink href="/billing/invoices" variant="outline" size="sm">
            Back to invoices
          </ButtonLink>
        </div>
      </header>

      {loadError && <ErrorState description={loadError} />}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StepCard step={1} title="Invoice details" icon={FileText}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Invoice number" hint="Assigned automatically on save">
              <Input value="Auto" disabled />
            </FormField>
            <FormField label="Invoice date" required>
              <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
            </FormField>
            <FormField label="Payment due date" hint="Separate from membership expiry">
              <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
            </FormField>
          </div>
        </StepCard>

        <StepCard step={2} title="Customer" icon={Users}>
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
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-primary-100 bg-primary-50/60 p-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-600 to-accent-500 text-sm font-semibold text-white">
                {initialsOf(member.fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-ink">{member.fullName}</p>
                <p className="truncate text-xs text-neutral-500">
                  {[member.code, member.phone].filter(Boolean).join(" · ") || "No code or phone on file"}
                </p>
              </div>
            </div>
          )}
        </StepCard>
      </div>

      <StepCard
        step={3}
        title="Membership information"
        icon={BadgeCheck}
        tone={activeMembership ? "success" : "default"}
      >
        {activeMembership ? (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="success" withDot>
                  Active membership
                </Badge>
                <span className="text-sm font-semibold text-ink">{activeMembership.planName}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <ButtonLink href={`/memberships/active/${activeMembership.id}`} variant="outline" size="sm">
                  View membership
                </ButtonLink>
                <ButtonLink href={`/memberships/active/add?memberId=${memberId}`} variant="outline" size="sm">
                  Create new membership
                </ButtonLink>
              </div>
            </div>
            <dl className="mt-4 grid grid-cols-2 gap-4 text-sm sm:grid-cols-3 lg:grid-cols-4">
              <InfoTile label="Plan" value={activeMembership.planName} />
              <InfoTile
                label="Membership ID"
                value={<span title={activeMembership.id}>{activeMembership.id.slice(0, 8)}…</span>}
              />
              <InfoTile label="Start date" value={formatDate(activeMembership.startDate)} />
              <InfoTile
                label="Base duration"
                value={activePlanDuration ? `${activePlanDuration} days` : "—"}
              />
              <InfoTile label="Valid until" value={formatDate(activeMembership.endDate)} />
              <InfoTile label="Status" value={<StatusBadge status={activeMembership.status} />} />
              <InfoTile label="Branch" value={memberBranch?.name ?? currentBranch?.name ?? "—"} />
              <InfoTile label="Trainer" value={member?.trainerName ?? "Unassigned"} />
            </dl>
          </div>
        ) : (
          <div className="rounded-xl border border-dashed border-border bg-surface-muted p-5">
            <div className="flex items-start gap-3">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary-600">
                <BadgeCheck aria-hidden="true" className="size-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">No active membership</p>
                <p className="mt-0.5 text-sm text-neutral-500">
                  You can select a Membership Plan below to create a new membership charge.
                </p>
                {memberId && (
                  <ButtonLink
                    href={`/memberships/active/add?memberId=${memberId}`}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    Create new membership
                  </ButtonLink>
                )}
              </div>
            </div>
          </div>
        )}

        {validityPlan && (
          <div className="mt-4 rounded-xl border border-primary-100 bg-primary-50/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-primary-800">
              <CalendarClock aria-hidden="true" className="size-4" />
              Membership validity
              <span className="text-xs font-normal text-neutral-500">(service window, not the invoice due date)</span>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
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
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <InfoTile
                label="Extra validity"
                value={meaningfulExtra ? `+${months} month(s), +${days} day(s)` : "None"}
              />
              <InfoTile
                label="Membership valid until"
                value={<span className="text-primary-800">{formatDate(validUntil)}</span>}
              />
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
                className="size-4 rounded border-border text-primary-600 focus-visible:ring-primary-500"
              />
              <span>
                {activeMembership
                  ? "Extend the current membership by the extra validity"
                  : "Create this membership when the invoice is saved"}
              </span>
            </label>
            <p className="mt-1 text-xs text-neutral-500">
              Selecting a plan only fills this invoice line. The membership is created or extended only when the box
              above is ticked.
            </p>
          </div>
        )}
      </StepCard>

      <StepCard
        step={4}
        title="Invoice items"
        description="Add each charge on the invoice. Membership lines require a plan."
        icon={ListPlus}
        actions={
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
        }
      >
        {fieldErrors.items ? (
          <p role="alert" className="mb-3 text-xs font-medium text-red-600">
            {fieldErrors.items}
          </p>
        ) : null}

        <div
          className={cn(
            "hidden gap-3 border-b border-border pb-2 text-[11px] font-semibold tracking-wide text-neutral-500 uppercase lg:grid",
            ITEMS_GRID,
          )}
        >
          <span className="text-center">#</span>
          <span>Description</span>
          <span>Type</span>
          <span>Membership plan</span>
          <span className="text-right">Qty</span>
          <span className="text-right">Rate</span>
          <span className="text-right">Discount</span>
          <span className="text-right">GST %</span>
          <span className="text-right">Total</span>
          <span className="text-right">Action</span>
        </div>

        <div className="divide-y divide-border">
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
              <div key={index} className="py-3 first:pt-3">
                <div className={cn("grid grid-cols-2 gap-3 lg:items-start", ITEMS_GRID)}>
                  <div className="hidden items-start justify-center pt-2 text-xs font-medium text-neutral-400 lg:flex">
                    {index + 1}
                  </div>

                  <ItemCell label={`Item ${index + 1}`} className="col-span-2 lg:col-span-1">
                    <Input
                      value={item.description}
                      invalid={Boolean(fieldErrors[`item.${index}.description`])}
                      onChange={(event) => updateItem(index, { description: event.target.value })}
                    />
                    <Input
                      value={item.hsnSac}
                      maxLength={20}
                      placeholder="HSN / SAC (optional)"
                      className="mt-2 h-8 text-xs"
                      onChange={(event) => updateItem(index, { hsnSac: event.target.value })}
                    />
                    {fieldErrors[`item.${index}.description`] ? (
                      <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                        {fieldErrors[`item.${index}.description`]}
                      </p>
                    ) : null}
                  </ItemCell>

                  <ItemCell label="Type" className="col-span-1">
                    <Select
                      value={item.itemType}
                      onChange={(event) => updateItem(index, { itemType: event.target.value })}
                      options={INVOICE_ITEM_TYPES.map((type) => ({ value: type, label: INVOICE_ITEM_TYPE_LABELS[type] }))}
                    />
                  </ItemCell>

                  <ItemCell label="Membership plan" className="col-span-2 lg:col-span-1">
                    {showsPlanSelector(item.itemType) ? (
                      <>
                        <PlanPicker
                          value={item.planId}
                          options={plans}
                          currency={currency}
                          invalid={Boolean(fieldErrors[`item.${index}.planId`])}
                          placeholder={plans.length ? "Select a membership plan" : "No active plans"}
                          onChange={(planId) => updateItem(index, { planId })}
                        />
                        {fieldErrors[`item.${index}.planId`] ? (
                          <p role="alert" className="mt-1 text-xs font-medium text-red-600">
                            {fieldErrors[`item.${index}.planId`]}
                          </p>
                        ) : null}
                      </>
                    ) : (
                      <span className="block h-10 text-sm text-neutral-400">—</span>
                    )}
                  </ItemCell>

                  <ItemCell label="Quantity" className="col-span-1">
                    <Input
                      type="number"
                      min={0.001}
                      step={0.001}
                      value={item.quantity}
                      invalid={Boolean(fieldErrors[`item.${index}.quantity`])}
                      onChange={(event) => updateItem(index, { quantity: event.target.value })}
                    />
                  </ItemCell>

                  <ItemCell label="Rate" className="col-span-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.unitPrice}
                      invalid={Boolean(fieldErrors[`item.${index}.unitPrice`])}
                      onChange={(event) => updateItem(index, { unitPrice: event.target.value })}
                    />
                  </ItemCell>

                  <ItemCell label="Discount" className="col-span-1">
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={item.discount}
                      invalid={Boolean(fieldErrors[`item.${index}.discount`])}
                      onChange={(event) => updateItem(index, { discount: event.target.value })}
                    />
                  </ItemCell>

                  <ItemCell label="GST %" className="col-span-1">
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
                  </ItemCell>

                  <ItemCell label="Line total" className="col-span-1">
                    <span className="flex h-10 items-center justify-end tabular-nums text-sm font-medium text-ink lg:pr-1">
                      {formatCurrency(computed[index]?.lineTotal ?? 0, currency)}
                    </span>
                  </ItemCell>

                  <div className="col-span-1 flex items-start justify-end pt-0.5">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Remove item"
                      disabled={items.length === 1}
                      onClick={() => setItems((prev) => prev.filter((_, i) => i !== index))}
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </Button>
                  </div>
                </div>
                {(fieldErrors[`item.${index}.quantity`] ||
                  fieldErrors[`item.${index}.unitPrice`] ||
                  fieldErrors[`item.${index}.discount`] ||
                  fieldErrors[`item.${index}.planId`]) && (
                  <p role="alert" className="mt-2 text-xs font-medium text-red-600">
                    {fieldErrors[`item.${index}.quantity`] ??
                      fieldErrors[`item.${index}.unitPrice`] ??
                      fieldErrors[`item.${index}.discount`] ??
                      fieldErrors[`item.${index}.planId`]}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </StepCard>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <StepCard
          step={5}
          title="Tax & additional details"
          icon={Calculator}
          description="Transaction-level details. Tax mode comes from your Tax / GST settings."
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Place of supply">
              <Input value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} />
            </FormField>
            <FormField label="Round off">
              <Input type="number" step={0.01} value={roundOff} onChange={(event) => setRoundOff(event.target.value)} />
            </FormField>
          </div>
          <div className="mt-4">
            <FormField label="Notes">
              <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </div>
        </StepCard>

        <section className="rounded-card border border-border bg-surface p-5 shadow-card">
          <div className="flex items-center gap-2">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary-700">
              <Receipt aria-hidden="true" className="size-5" />
            </span>
            <h2 className="text-base font-semibold tracking-tight text-ink">Invoice summary</h2>
          </div>
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex justify-between">
              <dt className="text-neutral-500">Subtotal</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.subTotal, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Discount</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.discount, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">Taxable amount</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.taxableAmount, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">CGST</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.cgst, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">SGST</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.sgst, currency)}</dd>
            </div>
            <div className="flex justify-between">
              <dt className="text-neutral-500">IGST</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.igst, currency)}</dd>
            </div>
            <div className="flex justify-between border-b border-border pb-2">
              <dt className="text-neutral-500">Round off</dt>
              <dd className="tabular-nums text-ink">{formatCurrency(totals.roundOff, currency)}</dd>
            </div>
          </dl>
          <div className="mt-4 flex items-center justify-between rounded-xl bg-gradient-to-br from-primary-600 to-accent-600 p-4 text-white">
            <span className="text-xs font-medium tracking-wide uppercase text-white/75">Grand total</span>
            <span className="text-2xl font-semibold tabular-nums">
              {formatCurrency(totals.grandTotal, currency)}
            </span>
          </div>
        </section>
      </div>

      <StepCard
        step={6}
        title="Payment"
        icon={CreditCard}
        description="Record what the customer paid now. Split a payment across methods if needed."
        actions={
          <Button type="button" variant="outline" size="sm" onClick={addPayment} disabled={!paymentReceived}>
            <Plus aria-hidden="true" className="size-4" />
            Add payment method
          </Button>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={paymentReceived}
              onChange={(event) => togglePaymentReceived(event.target.checked)}
              className="size-4 rounded border-border text-primary-600 focus-visible:ring-primary-500"
            />
            <span className="font-medium text-ink">Payment received</span>
          </label>
          <span className="text-xs text-neutral-500">
            Uncheck to keep the invoice unpaid and use Save draft.
          </span>
        </div>

        {fieldErrors.payments ? (
          <p role="alert" className="mt-3 text-xs font-medium text-red-600">
            {fieldErrors.payments}
          </p>
        ) : null}

        {paymentReceived && (
          <div className="mt-4 space-y-3">
            {payments.map((payment, index) => (
              <div
                key={payment.key}
                className="grid grid-cols-1 gap-3 rounded-xl border border-border p-3 sm:grid-cols-12 sm:items-end"
              >
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
                <div className="flex sm:col-span-2 sm:justify-end sm:pb-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remove payment"
                    disabled={payments.length === 1}
                    onClick={() => removePayment(payment.key)}
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}

        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <dt className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Invoice total</dt>
            <dd className="mt-1 tabular-nums text-lg font-semibold text-ink">
              {formatCurrency(totals.grandTotal, currency)}
            </dd>
          </div>
          <div className="rounded-xl border border-border bg-surface-muted p-3">
            <dt className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Total received</dt>
            <dd className="mt-1 tabular-nums text-lg font-semibold text-primary-700">
              {formatCurrency(paymentTotal, currency)}
            </dd>
          </div>
          <div
            className={cn(
              "rounded-xl border p-3",
              remaining > 0 ? "border-amber-200 bg-amber-50" : "border-emerald-200 bg-emerald-50",
            )}
          >
            <dt className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">Balance due</dt>
            <dd
              className={cn(
                "mt-1 tabular-nums text-lg font-semibold",
                remaining > 0 ? "text-amber-700" : "text-emerald-700",
              )}
            >
              {formatCurrency(remaining, currency)}
            </dd>
          </div>
        </dl>
      </StepCard>

      <div className="sticky bottom-0 z-30">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-primary-100 bg-white/95 p-4 shadow-pop backdrop-blur">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="inline-flex items-center gap-1.5 text-neutral-500">
              <Wallet aria-hidden="true" className="size-4 text-primary-600" />
              Total
              <span className="font-semibold tabular-nums text-ink">{formatCurrency(totals.grandTotal, currency)}</span>
            </span>
            <span className="text-neutral-500">
              Received
              <span className="ml-1 font-semibold tabular-nums text-primary-700">
                {formatCurrency(paymentTotal, currency)}
              </span>
            </span>
            <span className="text-neutral-500">
              Balance
              <span className={cn("ml-1 font-semibold tabular-nums", remaining > 0 ? "text-amber-700" : "text-emerald-700")}>
                {formatCurrency(remaining, currency)}
              </span>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              onClick={() => void submit("draft")}
              isLoading={saving === "draft"}
              disabled={Boolean(saving)}
            >
              Save draft
            </Button>
            <Button
              onClick={() => void submit("finalize")}
              isLoading={saving === "finalize"}
              disabled={Boolean(saving)}
            >
              <BadgeCheck aria-hidden="true" className="size-4" />
              Create invoice &amp; record payment
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
