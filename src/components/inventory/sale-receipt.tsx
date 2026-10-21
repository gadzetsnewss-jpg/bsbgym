"use client";

import * as React from "react";
import { BadgeCheck, Printer, XCircle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchPosSale, voidPosSale } from "@/lib/inventory/client";
import type { PosSaleRow } from "@/lib/inventory/types";
import { DocumentSheet } from "@/components/documents/document-sheet";
import { posSaleDocument, sellerFromOrganization } from "@/lib/documents/engine";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  type InvoiceSettings,
  type PrintSettings,
} from "@/lib/org/settings-catalog";
import { fetchPrintConfigForBranch } from "@/lib/org/resolved-settings";

export function SaleReceipt({ saleId }: { saleId: string }) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canVoid = can("pos.create");

  const [sale, setSale] = React.useState<PosSaleRow | null>(null);
  const [print, setPrint] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [invoiceSettings, setInvoiceSettings] = React.useState<InvoiceSettings>(DEFAULT_INVOICE_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [confirmVoid, setConfirmVoid] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPosSale(orgId, saleId);
    if (result.error) {
      setLoading(false);
      setError(result.error.message);
      return;
    }
    setSale(result.data);
    const config = await fetchPrintConfigForBranch(orgId, result.data.branchId);
    if (config.data) {
      setPrint(config.data.print);
      setInvoiceSettings(config.data.invoice);
    }
    setLoading(false);
  }, [orgId, saleId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading receipt…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!sale) return <ErrorState description="That sale could not be found." />;

  const document = posSaleDocument(sale, sellerFromOrganization(organization));
  const isVoid = sale.status === "void";

  return (
    <div className="space-y-6 print:space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <ButtonLink href="/pos/sales" variant="outline">
          Back to sales
        </ButtonLink>
        <div className="flex flex-wrap gap-2">
          {canVoid && !isVoid && (
            <Button variant="outline" onClick={() => setConfirmVoid(true)}>
              <XCircle aria-hidden="true" className="size-4" />
              Void sale
            </Button>
          )}
          <Button onClick={() => window.print()}>
            <Printer aria-hidden="true" className="size-4" />
            Print receipt
          </Button>
        </div>
      </div>

      {isVoid && (
        <p className="flex items-center gap-2 rounded-card border border-red-200 bg-red-50/60 px-4 py-3 text-sm text-red-700 print:hidden">
          <BadgeCheck aria-hidden="true" className="size-4" />
          This sale was voided and its stock returned.
        </p>
      )}

      <DocumentSheet document={document} config={{ print, invoice: invoiceSettings }} currency={currency} />

      <ConfirmDialog
        open={confirmVoid}
        onClose={() => setConfirmVoid(false)}
        title="Void sale"
        description="Voiding returns the sold quantities to stock. The receipt is kept for your records."
        confirmLabel="Void sale"
        tone="danger"
        isLoading={busy}
        onConfirm={async () => {
          setBusy(true);
          const result = await voidPosSale(sale.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not void sale", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Sale voided", description: "Stock restored.", variant: "success" });
          setConfirmVoid(false);
          void load();
        }}
      />
    </div>
  );
}
