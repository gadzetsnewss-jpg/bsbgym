"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { FileMinus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  applyCreditNote,
  createCreditNote,
  fetchInvoice,
  fetchInvoices,
  fetchCreditNotes,
  voidCreditNote,
} from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { CREDIT_NOTE_REASONS, CREDIT_REASON_LABELS, CREDIT_STATUS_LABELS } from "@/lib/billing/types";
import { humanStatus } from "@/components/billing/status-copy";
import type { CreditNoteRow, InvoiceRow } from "@/lib/billing/types";

export function CreditNotesList() {
  const searchParams = useSearchParams();
  const presetInvoiceId = searchParams.get("invoiceId") ?? "";
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<CreditNoteRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(Boolean(presetInvoiceId));
  const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
  const [invoiceId, setInvoiceId] = React.useState(presetInvoiceId);
  const [reason, setReason] = React.useState("overcharge");
  const [notes, setNotes] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [applyNow, setApplyNow] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [applyRow, setApplyRow] = React.useState<CreditNoteRow | null>(null);
  const [voidRow, setVoidRow] = React.useState<CreditNoteRow | null>(null);
  const [selectedInvoice, setSelectedInvoice] = React.useState<InvoiceRow | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchCreditNotes(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!orgId || !open) return;
    void fetchInvoices({ organizationId: orgId, pageSize: 100 }).then((result) => {
      const list = (result.data?.rows ?? []).filter((row) => !["draft", "void"].includes(row.status));
      setInvoices(list);
      setInvoiceId((current) => current || list[0]?.id || "");
    });
  }, [orgId, open]);

  React.useEffect(() => {
    if (!orgId || !invoiceId) {
      setSelectedInvoice(null);
      return;
    }
    void fetchInvoice(orgId, invoiceId).then((result) => {
      if (result.data) {
        const invoice = result.data;
        setSelectedInvoice(invoice);
        setAmount((current) => current || String(invoice.total));
      }
    });
  }, [orgId, invoiceId]);

  const columns: Column<CreditNoteRow>[] = [
    { id: "number", header: "Credit #", cell: (row) => row.creditNumber },
    { id: "date", header: "Date", cell: (row) => formatDate(row.issueDate) },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    { id: "invoice", header: "Invoice", cell: (row) => row.invoiceNumber ?? "—" },
    { id: "reason", header: "Reason", cell: (row) => CREDIT_REASON_LABELS[row.reason ?? ""] ?? row.reason ?? "—" },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatCurrency(row.amount, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={CREDIT_STATUS_LABELS[row.status] ?? humanStatus(row.status)} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.creditNumber}`}
          items={[
            ...(row.invoiceId ? [{ label: "View invoice", href: `/billing/invoices/${row.invoiceId}` }] : []),
            ...(can("billing.create") && row.status === "issued"
              ? [{ label: "Apply", onClick: () => setApplyRow(row) }]
              : []),
            ...(can("billing.void") && row.status !== "applied" && row.status !== "void"
              ? [{ label: "Cancel", variant: "danger" as const, separator: true, onClick: () => setVoidRow(row) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Credit notes"
        description="Credits against invoices. Applied notes reduce the invoice balance."
        icon={FileMinus}
        actions={
          can("billing.create") ? (
            <Button onClick={() => setOpen(true)}>New credit note</Button>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No credit notes"
          emptyDescription="Issue a credit note against an invoice that was overcharged or cancelled."
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="New credit note" size="lg">
        <div className="space-y-4">
          <FormField label="Invoice" required>
            <Select
              value={invoiceId}
              onChange={(event) => setInvoiceId(event.target.value)}
              options={invoices.map((row) => ({
                value: row.id,
                label: `${row.invoiceNumber} · ${row.memberName}`,
              }))}
            />
          </FormField>
          <FormField label="Reason" required>
            <Select
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              options={CREDIT_NOTE_REASONS.map((item) => ({ value: item, label: CREDIT_REASON_LABELS[item] }))}
            />
          </FormField>
          <FormField label="Amount" required>
            <Input type="number" min={0.01} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={applyNow} onChange={(event) => setApplyNow(event.target.checked)} />
            Apply to invoice immediately
          </label>
          <Button
            onClick={async () => {
              if (!orgId || !invoiceId || !selectedInvoice) {
                toast({ title: "Select an invoice", variant: "error" });
                return;
              }
              const parsed = Number(amount);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                toast({ title: "Enter a credit amount greater than zero", variant: "error" });
                return;
              }
              setSaving(true);
              const firstItem = selectedInvoice.items?.[0];
              const result = await createCreditNote({
                organizationId: orgId,
                invoiceId,
                reason,
                notes,
                apply: applyNow,
                items: [
                  {
                    description: firstItem?.description || `Credit against ${selectedInvoice.invoiceNumber}`,
                    itemType: firstItem?.itemType || "other",
                    quantity: 1,
                    unitPrice: parsed,
                    discount: 0,
                    taxRate: 0,
                  },
                ],
              });
              setSaving(false);
              if (result.error) {
                toast({ title: "Could not create credit note", description: result.error.message, variant: "error" });
                return;
              }
              toast({ title: applyNow ? "Credit note applied" : "Credit note saved", variant: "success" });
              setOpen(false);
              void load();
            }}
            isLoading={saving}
          >
            {applyNow ? "Create and apply" : "Save credit note"}
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(applyRow)}
        onClose={() => setApplyRow(null)}
        title="Apply credit note"
        description="This reduces the linked invoice balance. Applied credit notes cannot be cancelled."
        confirmLabel="Apply"
        tone="primary"
        onConfirm={async () => {
          if (!applyRow) return;
          const result = await applyCreditNote(applyRow.id);
          if (result.error) {
            toast({ title: "Could not apply credit note", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Credit note applied", variant: "success" });
          setApplyRow(null);
          void load();
        }}
      />

      <ConfirmDialog
        open={Boolean(voidRow)}
        onClose={() => setVoidRow(null)}
        title="Cancel credit note"
        description="Cancelled credit notes remain in history and are not deleted."
        confirmLabel="Cancel credit note"
        tone="danger"
        onConfirm={async () => {
          if (!voidRow) return;
          const result = await voidCreditNote(voidRow.id);
          if (result.error) {
            toast({ title: "Could not cancel credit note", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Credit note cancelled", variant: "success" });
          setVoidRow(null);
          void load();
        }}
      />
    </div>
  );
}
