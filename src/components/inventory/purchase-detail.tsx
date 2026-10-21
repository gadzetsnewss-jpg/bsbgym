"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, PackageCheck, Truck, XCircle } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchPurchase, receivePurchase, cancelPurchase } from "@/lib/inventory/client";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONES,
  type PurchaseItemRow,
  type PurchaseRow,
} from "@/lib/inventory/types";

export function PurchaseDetail({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canManage = can("inventory.manage");

  const [purchase, setPurchase] = React.useState<PurchaseRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<null | "receive" | "cancel">(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPurchase(orgId, purchaseId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPurchase(result.data);
  }, [orgId, purchaseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading purchase…" />;
  if (error || !purchase) {
    return <ErrorState description={error ?? "That purchase could not be found."} onRetry={() => void load()} />;
  }

  const actionable = canManage && ["draft", "ordered"].includes(purchase.status);

  const columns: Column<PurchaseItemRow>[] = [
    { id: "product", header: "Item", cell: (row) => row.description },
    { id: "qty", header: "Quantity", align: "right", cell: (row) => row.quantity },
    {
      id: "cost",
      header: "Unit cost",
      align: "right",
      cell: (row) => formatCurrency(row.unitCost, currency),
    },
    {
      id: "total",
      header: "Line total",
      align: "right",
      cell: (row) => formatCurrency(row.lineTotal, currency),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={purchase.purchaseNumber}
        description={purchase.supplierName ? `Supplier: ${purchase.supplierName}` : undefined}
        icon={Truck}
        actions={
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/inventory/purchases" variant="outline">
              <ArrowLeft aria-hidden="true" className="size-4" />
              Back
            </ButtonLink>
            {actionable && (
              <>
                <Button variant="outline" onClick={() => setConfirm("cancel")}>
                  <XCircle aria-hidden="true" className="size-4" />
                  Cancel PO
                </Button>
                <Button onClick={() => setConfirm("receive")}>
                  <PackageCheck aria-hidden="true" className="size-4" />
                  Receive stock
                </Button>
              </>
            )}
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Status</p>
          <div className="mt-1">
            <Badge tone={PURCHASE_STATUS_TONES[purchase.status] ?? "neutral"}>
              {PURCHASE_STATUS_LABELS[purchase.status] ?? purchase.status}
            </Badge>
          </div>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Order date</p>
          <p className="mt-1 text-sm text-ink">{formatDate(purchase.orderDate)}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Branch</p>
          <p className="mt-1 text-sm text-ink">{purchase.branchName}</p>
        </Card>
        <Card className="p-4">
          <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Received</p>
          <p className="mt-1 text-sm text-ink">
            {purchase.receivedDate ? formatDate(purchase.receivedDate) : "Not received"}
          </p>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <DataTable
            columns={columns}
            data={purchase.items ?? []}
            rowKey={(row) => row.id}
            emptyTitle="No items on this purchase"
          />
          <div className="flex flex-col items-end gap-1 text-sm">
            <div className="flex w-full max-w-xs justify-between">
              <span className="text-neutral-500">Subtotal</span>
              <span>{formatCurrency(purchase.subTotal, currency)}</span>
            </div>
            <div className="flex w-full max-w-xs justify-between">
              <span className="text-neutral-500">Tax</span>
              <span>{formatCurrency(purchase.taxTotal, currency)}</span>
            </div>
            <div className="flex w-full max-w-xs justify-between text-base font-semibold">
              <span>Total</span>
              <span>{formatCurrency(purchase.total, currency)}</span>
            </div>
          </div>
          {purchase.notes && (
            <p className="border-t border-border pt-3 text-sm text-neutral-500">{purchase.notes}</p>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirm === "receive"}
        onClose={() => setConfirm(null)}
        title="Receive stock"
        description="Receiving adds the ordered quantities to stock. This can only be done once per purchase."
        confirmLabel="Receive stock"
        isLoading={busy}
        onConfirm={async () => {
          setBusy(true);
          const result = await receivePurchase(purchase.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not receive stock", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Stock received", variant: "success" });
          setConfirm(null);
          void load();
        }}
      />

      <ConfirmDialog
        open={confirm === "cancel"}
        onClose={() => setConfirm(null)}
        title="Cancel purchase order"
        description="Purchase records are cancelled, not deleted. Received purchases cannot be cancelled."
        confirmLabel="Cancel PO"
        tone="danger"
        isLoading={busy}
        onConfirm={async () => {
          setBusy(true);
          const result = await cancelPurchase(purchase.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not cancel purchase", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Purchase cancelled", variant: "success" });
          setConfirm(null);
          void load();
          router.push("/inventory/purchases");
        }}
      />
    </div>
  );
}
