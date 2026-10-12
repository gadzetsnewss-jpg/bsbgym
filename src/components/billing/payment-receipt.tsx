"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchPayment } from "@/lib/billing/client";
import type { PaymentRow } from "@/lib/billing/types";
import { DocumentSheet } from "@/components/documents/document-sheet";
import { paymentReceiptDocument, sellerFromOrganization } from "@/lib/documents/engine";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  type InvoiceSettings,
  type PrintSettings,
} from "@/lib/org/settings-catalog";
import { fetchPrintConfigForBranch } from "@/lib/org/resolved-settings";

export function PaymentReceipt({ paymentId }: { paymentId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [payment, setPayment] = React.useState<PaymentRow | null>(null);
  const [print, setPrint] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = React.useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    void fetchPayment(orgId, paymentId).then(async (result) => {
      if (result.error) {
        setLoading(false);
        setError(result.error.message);
        return;
      }
      setPayment(result.data);
      const config = await fetchPrintConfigForBranch(orgId, result.data?.branchId);
      if (config.data) {
        setPrint(config.data.print);
        setInvoiceSettings(config.data.invoice);
      }
      setLoading(false);
    });
  }, [orgId, paymentId]);

  if (loading) return <LoadingState label="Loading receipt…" />;
  if (error) return <ErrorState description={error} />;
  if (!payment) return <ErrorState description="That payment could not be found." />;

  const document = paymentReceiptDocument(payment, sellerFromOrganization(organization));

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
      <DocumentSheet document={document} config={{ print, invoice: invoiceSettings }} currency={currency} />
    </div>
  );
}
