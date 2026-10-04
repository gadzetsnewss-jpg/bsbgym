"use client";

import * as React from "react";
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
  fetchInvoiceInstallments,
  fetchInvoicePayments,
  issueInvoice,
  voidInvoice,
} from "@/lib/billing/client";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { INSTALLMENT_PRESETS, splitInstallments } from "@/lib/billing/installments";
import { humanStatus } from "@/components/billing/status-copy";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import type { InstallmentRow, InvoiceRow, PaymentRow } from "@/lib/billing/types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function InvoiceDetail({ invoiceId }: { invoiceId: string }) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [installments, setInstallments] = React.useState<InstallmentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payOpen, setPayOpen] = React.useState(false);
  const [payInstallment, setPayInstallment] = React.useState<InstallmentRow | null>(null);
  const [voidOpen, setVoidOpen] = React.useState(false);
  const [issueOpen, setIssueOpen] = React.useState(false);
  const [planOpen, setPlanOpen] = React.useState(false);
  const [planCount, setPlanCount] = React.useState("3");
  const [planCustom, setPlanCustom] = React.useState("6");
  const [planStart, setPlanStart] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [invoiceResult, paymentResult, installmentResult] = await Promise.all([
      fetchInvoice(orgId, invoiceId),
      fetchInvoicePayments(orgId, invoiceId),
      fetchInvoiceInstallments(orgId, invoiceId),
    ]);
    setLoading(false);
    if (invoiceResult.error) {
      setError(invoiceResult.error.message);
      return;
    }
    if (installmentResult.error) {
      setError(installmentResult.error.message);
      return;
    }
    setInvoice(invoiceResult.data);
    setPayments(paymentResult.data ?? []);
    setInstallments(installmentResult.data ?? []);
  }, [orgId, invoiceId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!invoice) return <ErrorState description="That invoice could not be found." />;

  const hasSchedule = installments.length > 0;
  const scheduleCount = planCount === "custom" ? Number(planCustom) : Number(planCount);
  const scheduleStart = planStart || todayIso();
  const previewRows =
    Number.isInteger(scheduleCount) && scheduleCount >= 1 && scheduleCount <= 24 && invoice.balance > 0
      ? splitInstallments(invoice.balance, scheduleCount, scheduleStart)
      : [];
  const canPay =
    can("payments.create") && invoice.balance > 0 && !["draft", "void", "paid"].includes(invoice.status);
  const canVoid = can("billing.void") && !["void", "paid"].includes(invoice.status);
  const canIssue = can("billing.create") && invoice.status === "draft";
  const canSchedule =
    can("billing.create") &&
    invoice.balance > 0 &&
    !hasSchedule &&
    !["draft", "void", "paid"].includes(invoice.status);

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
              <Button
                variant="outline"
                onClick={() => {
                  setPlanStart(todayIso());
                  setPlanOpen(true);
                }}
              >
                Create installment plan
              </Button>
            )}
            {hasSchedule && (
              <ButtonLink href="/billing/installments" variant="outline">
                View installments
              </ButtonLink>
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
                <td className="px-5 py-3">
                  <div>{item.description}</div>
                  {item.planName ? (
                    <div className="text-xs text-neutral-500">{item.planName}</div>
                  ) : null}
                </td>
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

      <Card className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-sm font-semibold text-ink">Installments</h2>
          {canSchedule && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setPlanStart(todayIso());
                setPlanOpen(true);
              }}
            >
              Create plan
            </Button>
          )}
        </div>
        {hasSchedule ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="border-b border-border text-left text-xs tracking-wide text-neutral-500 uppercase">
                <tr>
                  <th className="py-2 pr-3">#</th>
                  <th className="py-2 pr-3">Due date</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3 text-right">Paid</th>
                  <th className="py-2 pr-3 text-right">Remaining</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {installments.map((row, index) => (
                  <tr key={row.id} className="border-b border-border last:border-0">
                    <td className="py-2 pr-3 tabular-nums">{index + 1}</td>
                    <td className="py-2 pr-3">{formatDate(row.dueDate)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.amount, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.paidAmount, currency)}</td>
                    <td className="py-2 pr-3 text-right tabular-nums">{formatCurrency(row.remaining, currency)}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={humanStatus(row.status)} />
                    </td>
                    <td className="py-2 text-right">
                      {can("payments.create") && row.remaining > 0 ? (
                        <Button size="sm" variant="ghost" onClick={() => setPayInstallment(row)}>
                          Record payment
                        </Button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            title="No installment plan"
            description={
              invoice.balance <= 0
                ? "This invoice has no remaining balance to schedule."
                : "Split the remaining balance into monthly installments."
            }
          />
        )}
      </Card>

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

      <Modal
        open={Boolean(payInstallment)}
        onClose={() => setPayInstallment(null)}
        title="Record installment payment"
        description={
          payInstallment
            ? `${invoice.invoiceNumber} · due ${formatDate(payInstallment.dueDate)}`
            : undefined
        }
      >
        {payInstallment && (
          <RecordPaymentForm
            invoiceId={invoice.id}
            memberLabel={invoice.memberName}
            balance={Math.min(payInstallment.remaining, invoice.balance)}
            onDone={() => {
              setPayInstallment(null);
              void load();
            }}
          />
        )}
      </Modal>

      <Modal
        open={planOpen}
        onClose={() => setPlanOpen(false)}
        title="Create installment plan"
        description={`Splits the remaining ${formatCurrency(invoice.balance, currency)}. Paid ${formatCurrency(invoice.amountPaid, currency)} stays unchanged.`}
      >
        <div className="space-y-4">
          <div className="rounded-lg border border-border bg-neutral-50 px-3 py-2 text-sm">
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">Invoice total</span>
              <span className="tabular-nums">{formatCurrency(invoice.total, currency)}</span>
            </div>
            <div className="flex justify-between gap-3">
              <span className="text-neutral-500">Already paid</span>
              <span className="tabular-nums">{formatCurrency(invoice.amountPaid, currency)}</span>
            </div>
            <div className="flex justify-between gap-3 font-medium">
              <span>Remaining to schedule</span>
              <span className="tabular-nums">{formatCurrency(invoice.balance, currency)}</span>
            </div>
          </div>
          <FormField label="Plan">
            <Select
              value={planCount}
              onChange={(event) => setPlanCount(event.target.value)}
              options={[...INSTALLMENT_PRESETS]}
            />
          </FormField>
          {planCount === "custom" && (
            <FormField label="Number of installments" hint="Between 1 and 24">
              <Input
                type="number"
                min={1}
                max={24}
                value={planCustom}
                onChange={(event) => setPlanCustom(event.target.value)}
              />
            </FormField>
          )}
          <FormField label="First due date">
            <Input type="date" value={planStart} onChange={(event) => setPlanStart(event.target.value)} />
          </FormField>
          {previewRows.length > 0 ? (
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="min-w-full text-sm">
                <thead className="border-b border-border text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <tr>
                    <th className="px-3 py-2">#</th>
                    <th className="px-3 py-2">Due date</th>
                    <th className="px-3 py-2 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row) => (
                    <tr key={row.sortOrder} className="border-b border-border last:border-0">
                      <td className="px-3 py-2 tabular-nums">{row.sortOrder + 1}</td>
                      <td className="px-3 py-2">{formatDate(row.dueDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(row.amount, currency)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-neutral-500">Enter a count between 1 and 24 to preview the split.</p>
          )}
          <Button
            onClick={async () => {
              if (invoice.balance <= 0) {
                toast({ title: "No remaining balance to schedule", variant: "error" });
                return;
              }
              if (!Number.isInteger(scheduleCount) || scheduleCount < 1 || scheduleCount > 24) {
                toast({ title: "Installment count must be between 1 and 24", variant: "error" });
                return;
              }
              setSaving(true);
              const result = await createInstallmentSchedule(invoice.id, scheduleCount, planStart || null);
              setSaving(false);
              if (result.error) {
                toast({ title: "Could not create schedule", description: result.error.message, variant: "error" });
                return;
              }
              toast({ title: "Installment schedule created", variant: "success" });
              setPlanOpen(false);
              void load();
            }}
            isLoading={saving}
            disabled={previewRows.length === 0}
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
