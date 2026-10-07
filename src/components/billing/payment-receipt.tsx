"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchPayment } from "@/lib/billing/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import type { PaymentRow } from "@/lib/billing/types";

export function PaymentReceipt({ paymentId }: { paymentId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [payment, setPayment] = React.useState<PaymentRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    void fetchPayment(orgId, paymentId).then((result) => {
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setPayment(result.data);
    });
  }, [orgId, paymentId]);

  if (loading) return <LoadingState label="Loading receipt…" />;
  if (error) return <ErrorState description={error} />;
  if (!payment) return <ErrorState description="That payment could not be found." />;

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
        <ButtonLink
          href={payment.invoiceId ? `/billing/invoices/${payment.invoiceId}` : "/billing/payments"}
          variant="outline"
        >
          Back
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
            <p className="text-2xl font-semibold text-ink">PAYMENT RECEIPT</p>
            <p className="text-sm text-neutral-500">{payment.invoiceNumber ?? payment.id.slice(0, 8)}</p>
          </div>
        </header>

        <div className="mb-6 grid grid-cols-2 gap-6 text-sm">
          <div>
            <p className="text-xs tracking-wide text-neutral-500 uppercase">Received from</p>
            <p className="font-medium text-ink">{payment.memberName}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <dt className="text-neutral-500">Date</dt>
            <dd className="text-right">{formatDateTime(payment.paidAt)}</dd>
            <dt className="text-neutral-500">Invoice</dt>
            <dd className="text-right">{payment.invoiceNumber ?? "—"}</dd>
            <dt className="text-neutral-500">Method</dt>
            <dd className="text-right">{PAYMENT_METHOD_LABELS[payment.method] ?? payment.method}</dd>
            <dt className="text-neutral-500">Reference</dt>
            <dd className="text-right">{payment.reference ?? "—"}</dd>
          </dl>
        </div>

        <div className="rounded-lg border border-border px-4 py-6 text-center">
          <p className="text-xs tracking-wide text-neutral-500 uppercase">Amount received</p>
          <p className="mt-1 text-3xl font-semibold tabular-nums text-ink">
            {formatCurrency(payment.amount, currency)}
          </p>
        </div>

        {payment.notes && <p className="mt-6 text-sm text-neutral-500">{payment.notes}</p>}
        {payment.collectedBy && (
          <p className="mt-4 text-sm text-neutral-500">Collected by {payment.collectedBy}</p>
        )}
        <p className="mt-8 text-xs text-neutral-400">This is a computer-generated receipt.</p>
      </article>
    </div>
  );
}
