"use client";

import * as React from "react";
import { Boxes, History, PackagePlus, ShoppingCart, Truck } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchPurchases, fetchStockMovements } from "@/lib/inventory/client";
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONES,
  STOCK_MOVEMENT_TYPE_LABELS,
  type PurchaseRow,
  type StockMovementRow,
} from "@/lib/inventory/types";
import { formatCurrency, formatDateTime, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { ProductRow, SupplierRow } from "@/lib/catalog/adapters";

/**
 * Beginner-first contextual shortcuts and related transaction history shown on
 * Product and Supplier detail pages. Product context is preserved through
 * query params so staff never re-search a record they already opened.
 */
export function productDetailExtras(row: ProductRow) {
  return <ProductDetailExtras product={row} />;
}

export function supplierDetailExtras(row: SupplierRow) {
  return <SupplierDetailExtras supplier={row} />;
}

function ShortcutBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-wrap gap-2 rounded-card border border-border bg-surface-muted/60 p-4">
      {children}
    </div>
  );
}

function ProductDetailExtras({ product }: { product: ProductRow }) {
  const { can } = useOrganization();
  const canSell = can("pos.create");
  const canManage = can("inventory.manage");

  return (
    <div className="space-y-6">
      <ShortcutBar>
        <ButtonLink href={`/inventory/stock?product=${product.id}`} variant="outline" size="sm">
          <Boxes aria-hidden="true" className="size-4" />
          View stock
        </ButtonLink>
        {canSell && (
          <ButtonLink href={`/pos/new-sale?product=${product.id}`} variant="outline" size="sm">
            <ShoppingCart aria-hidden="true" className="size-4" />
            Sell in POS
          </ButtonLink>
        )}
        {canManage && (
          <ButtonLink href={`/inventory/purchases/new?product=${product.id}`} variant="outline" size="sm">
            <Truck aria-hidden="true" className="size-4" />
            Create purchase
          </ButtonLink>
        )}
      </ShortcutBar>
      <ProductMovements productId={product.id} />
    </div>
  );
}

function ProductMovements({ productId }: { productId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canView = can("inventory.view");

  const [rows, setRows] = React.useState<StockMovementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchStockMovements({ organizationId: orgId, productId, pageSize: 10 });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
  }, [orgId, productId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;
  if (loading) return <LoadingState label="Loading stock history…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const columns: Column<StockMovementRow>[] = [
    { id: "when", header: "When", cell: (row) => formatDateTime(row.createdAt) },
    {
      id: "type",
      header: "Type",
      cell: (row) => STOCK_MOVEMENT_TYPE_LABELS[row.movementType] ?? row.movementType,
    },
    {
      id: "qty",
      header: "Change",
      align: "right",
      cell: (row) => (
        <span className={cn("font-medium", row.quantity >= 0 ? "text-emerald-700" : "text-red-600")}>
          {row.quantity > 0 ? "+" : ""}
          {row.quantity} {row.unit}
        </span>
      ),
    },
    { id: "branch", header: "Branch", cell: (row) => row.branchName },
    {
      id: "source",
      header: "Source",
      cell: (row) => row.notes ?? row.referenceType ?? "—",
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Recent stock movements</CardTitle>
        <ButtonLink href={`/inventory/stock?product=${productId}`} variant="ghost" size="sm">
          <History aria-hidden="true" className="size-4" />
          View all
        </ButtonLink>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          emptyTitle="No stock movements yet"
          emptyDescription="Receive a purchase or make a sale to see movements here."
        />
        <p className="mt-3 text-xs text-neutral-500">
          Values shown in {currency}. Movement source links to the purchase or sale reference.
        </p>
      </CardContent>
    </Card>
  );
}

function SupplierDetailExtras({ supplier }: { supplier: SupplierRow }) {
  const { can } = useOrganization();
  const canManage = can("inventory.manage");
  if (!canManage) return null;

  return (
    <div className="space-y-6">
      <ShortcutBar>
        <ButtonLink href={`/inventory/purchases/new?supplier=${supplier.id}`} variant="outline" size="sm">
          <PackagePlus aria-hidden="true" className="size-4" />
          Create purchase
        </ButtonLink>
        <ButtonLink href={`/inventory/purchases?supplierId=${supplier.id}`} variant="outline" size="sm">
          <Truck aria-hidden="true" className="size-4" />
          Purchase history
        </ButtonLink>
      </ShortcutBar>
      <SupplierPurchases supplierId={supplier.id} />
    </div>
  );
}

function SupplierPurchases({ supplierId }: { supplierId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<PurchaseRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPurchases({ organizationId: orgId, supplierId, pageSize: 10 });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
  }, [orgId, supplierId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading purchase history…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  const columns: Column<PurchaseRow>[] = [
    { id: "number", header: "PO #", cell: (row) => row.purchaseNumber },
    { id: "date", header: "Order date", cell: (row) => formatDate(row.orderDate) },
    {
      id: "total",
      header: "Total",
      align: "right",
      cell: (row) => formatCurrency(row.total, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={PURCHASE_STATUS_TONES[row.status] ?? "neutral"}>
          {PURCHASE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
  ];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle>Purchase history</CardTitle>
        <ButtonLink href={`/inventory/purchases?supplierId=${supplierId}`} variant="ghost" size="sm">
          View all
        </ButtonLink>
      </CardHeader>
      <CardContent>
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          emptyTitle="No purchases yet"
          emptyDescription="Create a purchase order to record stock bought from this supplier."
        />
      </CardContent>
    </Card>
  );
}
