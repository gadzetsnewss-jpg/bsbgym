"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FileText, Printer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Modal } from "@/components/ui/modal";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  createInstallmentSchedule,
  fetchInvoice,
  fetchInvoicePayments,
  issueInvoice,
  voidInvoice,
} from "@/lib/billing/client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { INSTALLMENT_PRESETS } from "@/lib/billing/installments";
import { humanStatus } from "@/components/billing/status-copy";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [planCount, setPlanCount] = React.useState("3");
  const [planStart, setPlanStart] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [invoiceResult, paymentResult] = await Promise.all([
      fetchInvoice(orgId, invoiceId),
      fetchInvoicePayments(orgId, invoiceId),
    ]);
    setLoading(false);
    if (invoiceResult.error) {
      setError(invoiceResult.error.message);
      return;
    }
    setInvoice(invoiceResult.data);
    setPayments(paymentResult.data ?? []);
  }, [orgId, invoiceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!invoice) return <ErrorState description="That invoice could not be found." />;

  const canPay =
    can("payments.create") && invoice.balance > 0 && !["draft", "void", "paid"].includes(invoice.status);
  const canVoid = can("billing.void") && !["void", "paid"].includes(invoice.status);
  const canIssue = can("billing.create") && invoice.status === "draft";
  const canSchedule = can("billing.create") && !["draft", "void"].includes(invoice.status);

  return (
    <div className="space-y-6">
      <PageHeader
        title={invoice.invoiceNumber}
        description={`${invoice.memberName} · ${formatDate(invoice.issueDate)}`}
        icon={FileText}
        actions={
          <>
            <ButtonLink href={`/billing/invoices/${invoice.id}/print`} variant="outline">
              <Printer aria-hidden="true" className="size-4" />
              Print
            </ButtonLink>
            {canIssue && (
              <Button variant="outline" onClick={() => setIssueOpen(true)}>
                Issue invoice
              </Button>
            )}
            {canPay && <Button onClick={() => setPayOpen(true)}>Record payment</Button>}
            {canSchedule && (
              <Button variant="outline" onClick={() => setPlanOpen(true)}>
                Installments
              </Button>
            )}
            {can("billing.create") && invoice.status !== "void" && (
              <ButtonLink href={`/billing/credit-notes?invoiceId=${invoice.id}`} variant="outline">
                Credit note
              </ButtonLink>
            )}
            {canVoid && (
              <Button variant="destructive" onClick={() => setVoidOpen(true)}>
                Cancel
              </Button>
            )}
            <ButtonLink href="/billing/invoices" variant="ghost">
              Back
            </ButtonLink>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card className="space-y-3 lg:col-span-2">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs tracking-wide text-neutral-500 uppercase">Bill to</p>
              <p className="font-medium text-ink">{invoice.memberName}</p>
              <p className="text-sm text-neutral-500">{invoice.memberCode}</p>
              <p className="text-sm text-neutral-500">{invoice.memberPhone}</p>
              {invoice.memberEmail && <p className="text-sm text-neutral-500">{invoice.memberEmail}</p>}
              {invoice.memberAddress && <p className="text-sm text-neutral-500">{invoice.memberAddress}</p>}
            </div>
            <StatusBadge status={INVOICE_STATUS_LABELS[invoice.status] ?? humanStatus(invoice.status)} />
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Issue date</dt>
              <dd>{formatDate(invoice.issueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Due date</dt>
              <dd>{formatDate(invoice.dueDate)}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Branch</dt>
              <dd>{invoice.branchName}</dd>
            </div>
            <div>
              <dt className="text-xs text-neutral-500 uppercase">Place of supply</dt>
              <dd>{invoice.placeOfSupply ?? "—"}</dd>
            </div>
          </dl>
        </Card>
        <Card className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(invoice.total, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Paid</span>
            <span className="tabular-nums">{formatCurrency(invoice.amountPaid, currency)}</span>
          </div>
          <div className="flex justify-between">
            <span>Credited</span>
            <span className="tabular-nums">{formatCurrency(invoice.amountCredited, currency)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Balance</span>
            <span className="tabular-nums">{formatCurrency(invoice.balance, currency)}</span>
          </div>
        </Card>
      </div>

      <Card className="overflow-x-auto" noPadding>
        <table className="min-w-full text-sm">
          <thead className="border-b border-border text-left text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="px-5 py-3">Description</th>
              <th className="px-5 py-3">HSN / SAC</th>
              <th className="px-5 py-3">Qty</th>
              <th className="px-5 py-3 text-right">Rate</th>
              <th className="px-5 py-3 text-right">Discount</th>
              <th className="px-5 py-3 text-right">GST</th>
              <th className="px-5 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-border last:border-0">
                <td className="px-5 py-3">{item.description}</td>
                <td className="px-5 py-3">{item.hsnSac ?? "—"}</td>
                <td className="px-5 py-3">{item.quantity}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(item.unitPrice, currency)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(item.discount, currency)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(item.gstAmount, currency)}</td>
                <td className="px-5 py-3 text-right tabular-nums">{formatCurrency(item.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card className="space-y-2 text-sm">
          <h2 className="text-sm font-semibold text-ink">Tax summary</h2>
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(invoice.subTotal, currency)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{formatCurrency(invoice.discount, currency)}</span></div>
          <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{formatCurrency(invoice.cgst, currency)}</span></div>
          <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">{formatCurrency(invoice.sgst, currency)}</span></div>
          <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{formatCurrency(invoice.igst, currency)}</span></div>
          <div className="flex justify-between"><span>Round off</span><span className="tabular-nums">{formatCurrency(invoice.roundOff, currency)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Grand total</span>
            <span className="tabular-nums">{formatCurrency(invoice.total, currency)}</span>
          </div>
          {invoice.notes && <p className="pt-2 text-neutral-500">{invoice.notes}</p>}
        </Card>
        <Card className="space-y-3">
          <h2 className="text-sm font-semibold text-ink">Payments</h2>
          {payments.length === 0 ? (
            <EmptyState title="No payments" description="Record a payment against this invoice." />
          ) : (
            <ul className="space-y-3 text-sm">
              {payments.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-ink">{PAYMENT_METHOD_LABELS[row.method] ?? row.method}</p>
                    <p className="text-xs text-neutral-500">
                      {formatDateTime(row.paidAt)}
                      {row.reference ? ` · ${row.reference}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <p className="tabular-nums">{formatCurrency(row.amount, currency)}</p>
                    <ButtonLink href={`/billing/payments/${row.id}/print`} variant="ghost" size="sm">
                      Receipt
                    </ButtonLink>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <Modal open={payOpen} onClose={() => setPayOpen(false)} title="Record payment">
        <RecordPaymentForm
          invoiceId={invoice.id}
          memberLabel={invoice.memberName}
          balance={invoice.balance}
          onDone={() => {
            setPayOpen(false);
            void load();
          }}
        />
      </Modal>

      <Modal open={planOpen} onClose={() => setPlanOpen(false)} title="Installment schedule">
        <div className="space-y-4">
          <FormField label="Plan">
            <Select
              value={planCount}
              onChange={(event) => setPlanCount(event.target.value)}
              options={INSTALLMENT_PRESETS.filter((item) => item.value !== "custom").map((item) => ({
                value: item.value,
                label: item.label,
              }))}
            />
          </FormField>
          <FormField label="First due date">
            <Input type="date" value={planStart} onChange={(event) => setPlanStart(event.target.value)} />
          </FormField>
          <Button
            onClick={async () => {
              setSaving(true);
              const result = await createInstallmentSchedule(invoice.id, Number(planCount), planStart || null);
              setSaving(false);
              if (result.error) {
                toast({ title: "Could not create schedule", description: result.error.message, variant: "error" });
                return;
              }
              toast({ title: "Installment schedule created", variant: "success" });
              setPlanOpen(false);
              router.push("/billing/installments");
            }}
            isLoading={saving}
          >
            Create schedule
          </Button>
        </div>
      </Modal>

      <ConfirmDialog
        open={voidOpen}
        onClose={() => setVoidOpen(false)}
        title="Cancel invoice"
        description="Finalized financial records are cancelled, not deleted. Paid invoices cannot be cancelled."
        confirmLabel="Cancel invoice"
        tone="danger"
        onConfirm={async () => {
          const result = await voidInvoice(invoice.id, "Cancelled from invoice detail");
          if (result.error) {
            toast({ title: "Could not cancel invoice", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Invoice cancelled", variant: "success" });
          setVoidOpen(false);
          void load();
        }}
      />

      <ConfirmDialog
        open={issueOpen}
        onClose={() => setIssueOpen(false)}
        title="Issue invoice"
        description="Issuing assigns this draft as an open invoice that can receive payments."
        confirmLabel="Issue"
        tone="primary"
        onConfirm={async () => {
          const result = await issueInvoice(invoice.id);
          if (result.error) {
            toast({ title: "Could not issue invoice", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Invoice issued", variant: "success" });
          setIssueOpen(false);
          void load();
        }}
      />
    </div>
  );
}
