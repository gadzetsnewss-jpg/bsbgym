"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { FilePlus, Plus, Trash2 } from "lucide-react";
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
import { createInvoice, fetchGstRates, fetchMemberForInvoice, recordPayment } from "@/lib/billing/client";
import {
  calculateInvoiceTotals,
  calculateLineGst,
  resolveSupplyKind,
  type TaxMode,
} from "@/lib/billing/gst";
import { loadMemberOptions } from "@/lib/operations/adapters";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  INVOICE_ITEM_TYPES,
  INVOICE_ITEM_TYPE_LABELS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
} from "@/lib/billing/types";
import type { SelectOption } from "@/components/ui/select";

interface DraftItem {
  description: string;
  itemType: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  taxRate: string;
  hsnSac: string;
}

const emptyItem = (taxRate = "18", hsnSac = ""): DraftItem => ({
  description: "",
  itemType: "membership",
  quantity: "1",
  unitPrice: "",
  discount: "0",
  taxRate,
  hsnSac,
});

export function NewInvoiceForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const presetMemberId = searchParams.get("memberId") ?? "";
  const presetMembershipId = searchParams.get("membershipId") ?? "";

  const [members, setMembers] = React.useState<SelectOption[]>([]);
  const [gstRates, setGstRates] = React.useState<{ name: string; rate: number; hsnSac: string | null; isDefault: boolean }[]>([]);
  const [memberId, setMemberId] = React.useState(presetMemberId);
  const [branchId, setBranchId] = React.useState(currentBranchId ?? branches[0]?.id ?? "");
  const [issueDate, setIssueDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [dueDate, setDueDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [taxMode, setTaxMode] = React.useState<TaxMode>("exclusive");
  const [placeOfSupply, setPlaceOfSupply] = React.useState(organization?.state ?? "");
  const [roundOff, setRoundOff] = React.useState("0");
  const [items, setItems] = React.useState<DraftItem[]>([emptyItem()]);
  const [payNow, setPayNow] = React.useState(false);
  const [payAmount, setPayAmount] = React.useState("");
  const [payMethod, setPayMethod] = React.useState("upi");
  const [payReference, setPayReference] = React.useState("");
  const [member, setMember] = React.useState<Awaited<ReturnType<typeof fetchMemberForInvoice>>["data"]>(null);
  const [saving, setSaving] = React.useState<"draft" | "issue" | "pay" | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    void loadMemberOptions(orgId).then(setMembers);
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
      if (next.branchId) setBranchId(next.branchId);
      if (next.membership) {
        setItems((prev) =>
          prev[0]?.description
            ? prev
            : [
                {
                  ...prev[0],
                  description: `${next.membership!.planName} membership`,
                  itemType: "membership",
                },
                ...prev.slice(1),
              ],
        );
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, memberId, presetMembershipId]);

  const supply = resolveSupplyKind(organization?.state, placeOfSupply);
  const computed = items.map((item) =>
    calculateLineGst({
      quantity: Number(item.quantity) || 0,
      unitPrice: Number(item.unitPrice) || 0,
      discount: Number(item.discount) || 0,
      taxRate: Number(item.taxRate) || 0,
      taxMode,
      supply,
    }),
  );
  const totals = calculateInvoiceTotals(computed, Number(roundOff) || 0);

  const updateItem = (index: number, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, ...patch } : item)));
  };

  const submit = async (mode: "draft" | "issue" | "pay") => {
    if (!orgId) return;
    if (!memberId) {
      toast({ title: "Select a member", variant: "error" });
      return;
    }
    if (!branchId) {
      toast({ title: "Select a branch", variant: "error" });
      return;
    }
    if (computed.every((line) => line.lineTotal <= 0)) {
      toast({ title: "Add at least one invoice item", variant: "error" });
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
      taxMode,
      roundOff: Number(roundOff) || 0,
      issue: mode !== "draft",
      items: items.map((item) => ({
        description: item.description,
        itemType: item.itemType,
        quantity: Number(item.quantity) || 0,
        unitPrice: Number(item.unitPrice) || 0,
        discount: Number(item.discount) || 0,
        taxRate: Number(item.taxRate) || 0,
        hsnSac: item.hsnSac.trim() || null,
      })),
    });
    if (result.error) {
      setSaving(null);
      toast({ title: "Could not create invoice", description: result.error.message, variant: "error" });
      return;
    }
    if (mode === "pay") {
      const amount = Number(payAmount || totals.grandTotal);
      const pay = await recordPayment({
        organizationId: orgId,
        invoiceId: result.data.id,
        amount,
        method: payMethod,
        reference: payReference,
      });
      if (pay.error) {
        setSaving(null);
        toast({
          title: "Invoice created, payment failed",
          description: pay.error.message,
          variant: "error",
        });
        router.push(`/billing/invoices/${result.data.id}`);
        return;
      }
    }
    setSaving(null);
    toast({ title: mode === "draft" ? "Draft saved" : "Invoice created", variant: "success" });
    router.push(`/billing/invoices/${result.data.id}`);
  };

  if (!can("billing.create")) {
    return <ErrorState description="You do not have permission to create invoices." />;
  }
  if (!orgId) return <LoadingState label="Loading organization…" />;

  return (
    <div className="space-y-6">
      <PageHeader
        title="New invoice"
        description="Create a gym invoice. Payment is recorded only if you enter it."
        icon={FilePlus}
        actions={<ButtonLink href="/billing/invoices" variant="outline">Back to invoices</ButtonLink>}
      />

      {loadError && <ErrorState description={loadError} />}

      <FormSection title="Invoice" columns={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <FormField label="Invoice number" hint="Assigned automatically on save">
            <Input value="Auto" disabled />
          </FormField>
          <FormField label="Invoice date" required>
            <Input type="date" value={issueDate} onChange={(event) => setIssueDate(event.target.value)} />
          </FormField>
          <FormField label="Due date">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </FormField>
        </div>
      </FormSection>

      <FormSection title="Customer" columns={1}>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="Member" required>
            <Select
              value={memberId}
              placeholder="Search / select a member"
              onChange={(event) => setMemberId(event.target.value)}
              options={members}
            />
          </FormField>
          <FormField label="Branch" required>
            <Select
              value={branchId}
              onChange={(event) => setBranchId(event.target.value)}
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

      <FormSection title="Membership" columns={1}>
        {member?.membership ? (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Plan</dt>
              <dd className="text-ink">{member.membership.planName}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Start</dt>
              <dd className="text-ink">{formatDate(member.membership.startDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">End</dt>
              <dd className="text-ink">{formatDate(member.membership.endDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Status</dt>
              <dd className="text-ink">{member.membership.status}</dd>
            </div>
          </dl>
        ) : (
          <p className="text-sm text-neutral-500">No active membership on this member. You can still invoice other charges.</p>
        )}
      </FormSection>

      <Card className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Invoice items</h2>
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
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
              <tr>
                <th className="pb-2">Description</th>
                <th className="pb-2">Type</th>
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
              {items.map((item, index) => (
                <tr key={index} className="align-top">
                  <td className="py-2 pr-2">
                    <Input value={item.description} onChange={(event) => updateItem(index, { description: event.target.value })} />
                  </td>
                  <td className="py-2 pr-2">
                    <Select
                      value={item.itemType}
                      onChange={(event) => updateItem(index, { itemType: event.target.value })}
                      options={INVOICE_ITEM_TYPES.map((type) => ({ value: type, label: INVOICE_ITEM_TYPE_LABELS[type] }))}
                    />
                  </td>
                  <td className="py-2 pr-2 w-28">
                    <Input
                      value={item.hsnSac}
                      maxLength={20}
                      onChange={(event) => updateItem(index, { hsnSac: event.target.value })}
                    />
                  </td>
                  <td className="py-2 pr-2 w-20">
                    <Input type="number" min={0.001} step={0.001} value={item.quantity} onChange={(event) => updateItem(index, { quantity: event.target.value })} />
                  </td>
                  <td className="py-2 pr-2 w-28">
                    <Input type="number" min={0} step={0.01} value={item.unitPrice} onChange={(event) => updateItem(index, { unitPrice: event.target.value })} />
                  </td>
                  <td className="py-2 pr-2 w-24">
                    <Input type="number" min={0} step={0.01} value={item.discount} onChange={(event) => updateItem(index, { discount: event.target.value })} />
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
                      options={
                        gstRates.length
                          ? gstRates.map((rate) => ({ value: String(rate.rate), label: `${rate.name} (${rate.rate}%)` }))
                          : [
                              { value: "0", label: "0%" },
                              { value: "5", label: "5%" },
                              { value: "12", label: "12%" },
                              { value: "18", label: "18%" },
                              { value: "28", label: "28%" },
                            ]
                      }
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
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <FormSection title="Tax" columns={1}>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Tax mode">
              <Select
                value={taxMode}
                onChange={(event) => setTaxMode(event.target.value as TaxMode)}
                options={[
                  { value: "exclusive", label: "Tax exclusive" },
                  { value: "inclusive", label: "Tax inclusive" },
                ]}
              />
            </FormField>
            <FormField label="Place of supply">
              <Input value={placeOfSupply} onChange={(event) => setPlaceOfSupply(event.target.value)} />
            </FormField>
            <FormField label="Round off">
              <Input type="number" step={0.01} value={roundOff} onChange={(event) => setRoundOff(event.target.value)} />
            </FormField>
            <FormField label="Notes">
              <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </div>
        </FormSection>
        <Card className="space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">Totals</h2>
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(totals.subTotal, currency)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{formatCurrency(totals.discount, currency)}</span></div>
          <div className="flex justify-between"><span>Taxable</span><span className="tabular-nums">{formatCurrency(totals.taxableAmount, currency)}</span></div>
          <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{formatCurrency(totals.cgst, currency)}</span></div>
          <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">{formatCurrency(totals.sgst, currency)}</span></div>
          <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{formatCurrency(totals.igst, currency)}</span></div>
          <div className="flex justify-between"><span>Round off</span><span className="tabular-nums">{formatCurrency(totals.roundOff, currency)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold"><span>Grand total</span><span className="tabular-nums">{formatCurrency(totals.grandTotal, currency)}</span></div>
        </Card>
      </div>

      <FormSection title="Payment" columns={1}>
        <p className="mb-3 text-sm text-neutral-500">
          Payment is optional. Leave this blank to create an unpaid or draft invoice.
        </p>
        <label className="mb-4 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={payNow} onChange={(event) => setPayNow(event.target.checked)} />
          Record a payment now
        </label>
        {payNow && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <FormField label="Amount">
              <Input type="number" min={0.01} step={0.01} value={payAmount} placeholder={String(totals.grandTotal)} onChange={(event) => setPayAmount(event.target.value)} />
            </FormField>
            <FormField label="Method">
              <Select
                value={payMethod}
                onChange={(event) => setPayMethod(event.target.value)}
                options={PAYMENT_METHODS.map((item) => ({ value: item, label: PAYMENT_METHOD_LABELS[item] }))}
              />
            </FormField>
            <FormField label="Reference">
              <Input value={payReference} onChange={(event) => setPayReference(event.target.value)} />
            </FormField>
          </div>
        )}
      </FormSection>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={() => void submit("draft")} isLoading={saving === "draft"} disabled={Boolean(saving)}>
          Save draft
        </Button>
        <Button onClick={() => void submit("issue")} isLoading={saving === "issue"} disabled={Boolean(saving)}>
          Create invoice
        </Button>
        <Button
          variant="secondary"
          onClick={() => void submit("pay")}
          isLoading={saving === "pay"}
          disabled={Boolean(saving) || !payNow}
        >
          Create and record payment
        </Button>
      </div>
    </div>
  );
}
