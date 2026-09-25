"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Undo2 } from "lucide-react";
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
import { fetchPayments, fetchRefunds, requestRefund, setRefundStatus } from "@/lib/billing/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import {
  PAYMENT_METHOD_LABELS,
  REFUND_METHODS,
  REFUND_STATUS_LABELS,
} from "@/lib/billing/types";
import { humanStatus } from "@/components/billing/status-copy";
import type { PaymentRow, RefundRow } from "@/lib/billing/types";

export function RefundsList() {
  const searchParams = useSearchParams();
  const presetPaymentId = searchParams.get("paymentId") ?? "";
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<RefundRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(Boolean(presetPaymentId));
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [paymentId, setPaymentId] = React.useState(presetPaymentId);
  const [amount, setAmount] = React.useState("");
  const [method, setMethod] = React.useState("original");
  const [reason, setReason] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const [statusRow, setStatusRow] = React.useState<{ row: RefundRow; status: string } | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchRefunds(orgId);
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
    void fetchPayments(orgId, { pageSize: 50 }).then((result) => {
      const list = result.data?.rows ?? [];
      setPayments(list);
      setPaymentId((current) => current || list[0]?.id || "");
      setAmount((current) => {
        if (current) return current;
        const selected = list.find((row) => row.id === (paymentId || list[0]?.id));
        return selected ? String(selected.amount) : current;
      });
    });
  }, [orgId, open, paymentId]);

  const selectedPayment = payments.find((row) => row.id === paymentId);

  const columns: Column<RefundRow>[] = [
    { id: "created", header: "Requested", cell: (row) => formatDateTime(row.createdAt) },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    { id: "invoice", header: "Invoice", cell: (row) => row.invoiceNumber ?? "—" },
    {
      id: "method",
      header: "Method",
      cell: (row) => PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatCurrency(row.amount, currency),
    },
    { id: "reason", header: "Reason", cell: (row) => row.reason ?? "—" },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={REFUND_STATUS_LABELS[row.status] ?? humanStatus(row.status)} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for refund ${row.id}`}
          items={[
            ...(row.invoiceId ? [{ label: "View invoice", href: `/billing/invoices/${row.invoiceId}` }] : []),
            ...(can("billing.refund") && row.status === "requested"
              ? [
                  { label: "Approve", onClick: () => setStatusRow({ row, status: "approved" }) },
                  { label: "Cancel", variant: "danger" as const, onClick: () => setStatusRow({ row, status: "rejected" }) },
                ]
              : []),
            ...(can("billing.refund") && row.status === "approved"
              ? [{ label: "Mark completed", onClick: () => setStatusRow({ row, status: "processed" }) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Refunds"
        description="Refunds against recorded payments. Completed refunds restore invoice balance."
        icon={Undo2}
        actions={
          can("billing.refund") ? (
            <Button onClick={() => setOpen(true)}>Request refund</Button>
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
          emptyTitle="No refunds"
          emptyDescription="Request a refund against a recorded payment."
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Request refund">
        <div className="space-y-4">
          <FormField label="Payment" required>
            <Select
              value={paymentId}
              onChange={(event) => {
                setPaymentId(event.target.value);
                const next = payments.find((row) => row.id === event.target.value);
                if (next) setAmount(String(next.amount));
              }}
              options={payments.map((row) => ({
                value: row.id,
                label: `${row.memberName} · ${formatCurrency(row.amount, currency)} · ${PAYMENT_METHOD_LABELS[row.method] ?? row.method}`,
              }))}
            />
          </FormField>
          <FormField label="Amount" required>
            <Input type="number" min={0.01} step={0.01} value={amount} onChange={(event) => setAmount(event.target.value)} />
          </FormField>
          <FormField label="Method" required>
            <Select
              value={method}
              onChange={(event) => setMethod(event.target.value)}
              options={REFUND_METHODS.map((item) => ({
                value: item,
                label: PAYMENT_METHOD_LABELS[item] ?? item,
              }))}
            />
          </FormField>
          <FormField label="Reason">
            <Input value={reason} onChange={(event) => setReason(event.target.value)} />
          </FormField>
          <FormField label="Notes">
            <Textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} />
          </FormField>
          <Button
            onClick={async () => {
              if (!orgId || !paymentId) {
                toast({ title: "Select a payment", variant: "error" });
                return;
              }
              const parsed = Number(amount);
              if (!Number.isFinite(parsed) || parsed <= 0) {
                toast({ title: "Enter a refund amount greater than zero", variant: "error" });
                return;
              }
              if (selectedPayment && parsed > selectedPayment.amount) {
                toast({ title: "Refund exceeds the refundable amount", variant: "error" });
                return;
              }
              setSaving(true);
              const result = await requestRefund({
                organizationId: orgId,
                paymentId,
                amount: parsed,
                method,
                reason,
                notes,
              });
              setSaving(false);
              if (result.error) {
                toast({ title: "Could not request refund", description: result.error.message, variant: "error" });
                return;
              }
              toast({ title: "Refund requested", variant: "success" });
              setOpen(false);
              void load();
            }}
            isLoading={saving}
          >
            Request refund
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusRow)}
        onClose={() => setStatusRow(null)}
        title={
          statusRow?.status === "processed"
            ? "Complete refund"
            : statusRow?.status === "rejected"
              ? "Cancel refund"
              : "Approve refund"
        }
        description={
          statusRow?.status === "processed"
            ? "Completing a refund reduces the invoice amount paid. This cannot be reversed."
            : statusRow?.status === "rejected"
              ? "Cancelled refunds remain in history and are not deleted."
              : "Approving marks this refund ready to complete."
        }
        confirmLabel={
          statusRow?.status === "processed"
            ? "Mark completed"
            : statusRow?.status === "rejected"
              ? "Cancel refund"
              : "Approve"
        }
        tone={statusRow?.status === "rejected" ? "danger" : "primary"}
        onConfirm={async () => {
          if (!statusRow) return;
          const result = await setRefundStatus(statusRow.row.id, statusRow.status);
          if (result.error) {
            toast({ title: "Could not update refund", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Refund updated", variant: "success" });
          setStatusRow(null);
          void load();
        }}
      />
    </div>
  );
}
