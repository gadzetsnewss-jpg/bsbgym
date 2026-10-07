"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { StatusBadge } from "@/components/ui/badge";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchInvoice, fetchInvoicePayments } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { humanStatus } from "@/components/billing/status-copy";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";

export function InvoicePrint({ invoiceId }: { invoiceId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    void Promise.all([fetchInvoice(orgId, invoiceId), fetchInvoicePayments(orgId, invoiceId)]).then(
      ([invoiceResult, paymentResult]) => {
        setLoading(false);
        if (invoiceResult.error) {
          setError(invoiceResult.error.message);
          return;
        }
        setInvoice(invoiceResult.data);
        setPayments(paymentResult.data ?? []);
      },
    );
  }, [orgId, invoiceId]);

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState description={error} />;
  if (!invoice) return <ErrorState description="That invoice could not be found." />;

  const orgAddress = [
    organization?.addressLine1,
    organization?.addressLine2,
    organization?.city,
    organization?.state,
    organization?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex items-center justify-between gap-3 print:hidden">
        <ButtonLink href={`/billing/invoices/${invoice.id}`} variant="outline">
          Back to invoice
        </ButtonLink>
        <Button onClick={() => window.print()}>
          <Printer aria-hidden="true" className="size-4" />
          Print
        </Button>
      </div>

      <article className="rounded-card border border-border bg-white p-8 print:border-0 print:p-0">
        <header className="mb-8 flex flex-wrap items-start justify-between gap-4">
          <div className="flex items-start gap-4">
            {organization?.logoUrl ? (
              <img
                src={organization.logoUrl}
                alt=""
                className="h-16 w-16 rounded-lg object-contain"
              />
            ) : null}
            <div>
              <p className="text-lg font-semibold text-ink">{organization?.name ?? "Gym"}</p>
              {organization?.legalName && <p className="text-sm text-neutral-500">{organization.legalName}</p>}
              {orgAddress && <p className="text-sm text-neutral-500">{orgAddress}</p>}
              {organization?.gstin && <p className="text-sm text-neutral-500">GSTIN {organization.gstin}</p>}
              {organization?.phone && <p className="text-sm text-neutral-500">{organization.phone}</p>}
              {organization?.email && <p className="text-sm text-neutral-500">{organization.email}</p>}
              {organization?.website && <p className="text-sm text-neutral-500">{organization.website}</p>}
            </div>
          </div>
          <div className="text-right">
            <p className="text-2xl font-semibold text-ink">TAX INVOICE</p>
            <p className="text-sm text-neutral-500">{invoice.invoiceNumber}</p>
            <StatusBadge status={INVOICE_STATUS_LABELS[invoice.status] ?? humanStatus(invoice.status)} />
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs tracking-wide text-neutral-500 uppercase">Bill to</p>
            <p className="font-medium text-ink">{invoice.memberName}</p>
            {invoice.memberCode && <p>{invoice.memberCode}</p>}
            {invoice.memberPhone && <p>{invoice.memberPhone}</p>}
            {invoice.memberEmail && <p>{invoice.memberEmail}</p>}
            {invoice.memberAddress && <p>{invoice.memberAddress}</p>}
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-neutral-500">Invoice date</dt>
            <dd className="text-right">{formatDate(invoice.issueDate)}</dd>
            <dt className="text-neutral-500">Due date</dt>
            <dd className="text-right">{formatDate(invoice.dueDate)}</dd>
            <dt className="text-neutral-500">Place of supply</dt>
            <dd className="text-right">{invoice.placeOfSupply ?? "—"}</dd>
            <dt className="text-neutral-500">Branch</dt>
            <dd className="text-right">{invoice.branchName}</dd>
          </dl>
        </div>

        <table className="mb-6 w-full text-sm">
          <thead className="border-y border-border text-left text-xs tracking-wide text-neutral-500 uppercase">
            <tr>
              <th className="py-2">Description</th>
              <th className="py-2">HSN / SAC</th>
              <th className="py-2">Qty</th>
              <th className="py-2 text-right">Rate</th>
              <th className="py-2 text-right">Discount</th>
              <th className="py-2 text-right">GST %</th>
              <th className="py-2 text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {(invoice.items ?? []).map((item) => (
              <tr key={item.id} className="border-b border-border">
                <td className="py-2">
                  <div>{item.description}</div>
                  {item.planName ? <div className="text-xs text-neutral-500">{item.planName}</div> : null}
                </td>
                <td className="py-2">{item.hsnSac ?? "—"}</td>
                <td className="py-2">{item.quantity}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.unitPrice, currency)}</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.discount, currency)}</td>
                <td className="py-2 text-right tabular-nums">{item.taxRate}%</td>
                <td className="py-2 text-right tabular-nums">{formatCurrency(item.lineTotal, currency)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="ml-auto w-full max-w-xs space-y-1 text-sm">
          <div className="flex justify-between"><span>Subtotal</span><span className="tabular-nums">{formatCurrency(invoice.subTotal, currency)}</span></div>
          <div className="flex justify-between"><span>Discount</span><span className="tabular-nums">{formatCurrency(invoice.discount, currency)}</span></div>
          <div className="flex justify-between"><span>CGST</span><span className="tabular-nums">{formatCurrency(invoice.cgst, currency)}</span></div>
          <div className="flex justify-between"><span>SGST</span><span className="tabular-nums">{formatCurrency(invoice.sgst, currency)}</span></div>
          <div className="flex justify-between"><span>IGST</span><span className="tabular-nums">{formatCurrency(invoice.igst, currency)}</span></div>
          <div className="flex justify-between"><span>Round off</span><span className="tabular-nums">{formatCurrency(invoice.roundOff, currency)}</span></div>
          <div className="flex justify-between border-t border-border pt-2 font-semibold">
            <span>Total</span>
            <span className="tabular-nums">{formatCurrency(invoice.total, currency)}</span>
          </div>
          <div className="flex justify-between"><span>Paid</span><span className="tabular-nums">{formatCurrency(invoice.amountPaid, currency)}</span></div>
          <div className="flex justify-between font-semibold">
            <span>Balance</span>
            <span className="tabular-nums">{formatCurrency(invoice.balance, currency)}</span>
          </div>
        </div>

        {payments.length > 0 && (
          <div className="mt-6 text-sm">
            <p className="mb-2 text-xs tracking-wide text-neutral-500 uppercase">Payments</p>
            <ul className="space-y-1">
              {payments.map((row) => (
                <li key={row.id} className="flex justify-between gap-3">
                  <span>
                    {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                    {row.reference ? ` · ${row.reference}` : ""}
                  </span>
                  <span className="tabular-nums">{formatCurrency(row.amount, currency)}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {invoice.notes && <p className="mt-6 text-sm text-neutral-500">{invoice.notes}</p>}
        <p className="mt-8 text-xs text-neutral-400">This is a computer-generated invoice.</p>
      </article>
    </div>
  );
}
