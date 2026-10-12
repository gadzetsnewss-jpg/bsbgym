"use client";

import * as React from "react";
import { Printer } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchInvoice, fetchInvoicePayments } from "@/lib/billing/client";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";
import { DocumentSheet } from "@/components/documents/document-sheet";
import { invoiceDocument, sellerFromOrganization } from "@/lib/documents/engine";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  type InvoiceSettings,
  type PrintSettings,
} from "@/lib/org/settings-catalog";
import { fetchPrintConfigForBranch } from "@/lib/org/resolved-settings";

export function InvoicePrint({ invoiceId }: { invoiceId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [invoice, setInvoice] = React.useState<InvoiceRow | null>(null);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [print, setPrint] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = React.useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    void Promise.all([fetchInvoice(orgId, invoiceId), fetchInvoicePayments(orgId, invoiceId)]).then(
      async ([invoiceResult, paymentResult]) => {
        if (invoiceResult.error) {
          setLoading(false);
          setError(invoiceResult.error.message);
          return;
        }
        const nextInvoice = invoiceResult.data;
        setInvoice(nextInvoice);
        setPayments(paymentResult.data ?? []);
        const config = await fetchPrintConfigForBranch(orgId, nextInvoice?.branchId);
        if (config.data) {
          setPrint(config.data.print);
          setInvoiceSettings(config.data.invoice);
        }
        setLoading(false);
      },
    );
  }, [orgId, invoiceId]);

  if (loading) return <LoadingState label="Loading invoice…" />;
  if (error) return <ErrorState description={error} />;
  if (!invoice) return <ErrorState description="That invoice could not be found." />;

  const document = invoiceDocument(invoice, sellerFromOrganization(organization), payments, invoiceSettings);

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
      <DocumentSheet document={document} config={{ print, invoice: invoiceSettings }} currency={currency} />
    </div>
  );
}
