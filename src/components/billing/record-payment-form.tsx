"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { recordPayment } from "@/lib/billing/client";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { formatCurrency } from "@/lib/format";

export function RecordPaymentForm({
  invoiceId,
  memberLabel,
  balance,
  onDone,
}: {
  invoiceId: string;
  memberLabel?: string;
  balance: number;
  onDone?: () => void;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canRecord = can("payments.create");

  const [amount, setAmount] = React.useState(String(balance));
  const [method, setMethod] = React.useState("upi");
  const [reference, setReference] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    const parsed = Number(amount);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      toast({ title: "Enter a payment amount greater than zero", variant: "error" });
      return;
    }
    if (parsed > balance) {
      toast({ title: "Payment exceeds the outstanding balance", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await recordPayment({
      organizationId: orgId,
      invoiceId,
      amount: parsed,
      method,
      reference,
      notes,
    });
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not record payment", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Payment recorded", variant: "success" });
    onDone?.();
    router.refresh();
  };

  if (!canRecord) {
    return <p className="text-sm text-neutral-500">You do not have permission to record payments.</p>;
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="space-y-4">
      {memberLabel && <p className="text-sm text-neutral-500">{memberLabel}</p>}
      <p className="text-sm text-neutral-500">
        Outstanding: <span className="font-medium text-ink">{formatCurrency(balance, currency)}</span>
      </p>
      <FormField label="Amount" required>
        <Input type="number" min={0.01} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} />
      </FormField>
      <FormField label="Method" required>
        <Select
          value={method}
          onChange={(event) => setMethod(event.target.value)}
          options={PAYMENT_METHODS.map((item) => ({ value: item, label: PAYMENT_METHOD_LABELS[item] }))}
        />
      </FormField>
      <FormField label="Reference">
        <Input value={reference} onChange={(event) => setReference(event.target.value)} placeholder="UPI / UTR / cheque no." />
      </FormField>
      <FormField label="Notes">
        <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
      </FormField>
      <Button type="submit" isLoading={saving}>
        Record payment
      </Button>
    </form>
  );
}
