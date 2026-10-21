"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Boxes, History, PackageSearch, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/tabs";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchStockOverview, fetchStockMovements, fetchStockFlow, loadPosProducts } from "@/lib/inventory/client";
import {
  STOCK_MOVEMENT_TYPE_LABELS,
  STOCK_MOVEMENT_TYPES,
  type StockMovementRow,
  type StockOverviewRow,
} from "@/lib/inventory/types";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

const MOVEMENT_TYPE_OPTIONS = [
  { value: "all", label: "All movements" },
  ...STOCK_MOVEMENT_TYPES.map((type) => ({
    value: type,
    label: STOCK_MOVEMENT_TYPE_LABELS[type],
  })),
];

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "primary";
}) {
  return (
    <Card className="p-4">
      <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "warning" && "text-amber-700",
          tone === "primary" && "text-primary-800",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}

export function StockScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { organization, branches } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const presetProduct = searchParams.get("product") ?? "";

  const [tab, setTab] = React.useState(presetProduct ? "movements" : "overview");

  const [overview, setOverview] = React.useState<StockOverviewRow[]>([]);
  const [overviewLoading, setOverviewLoading] = React.useState(true);
  const [overviewError, setOverviewError] = React.useState<string | null>(null);
  const [search, setSearch] = React.useState("");
  const [lowOnly, setLowOnly] = React.useState(false);

  const [movements, setMovements] = React.useState<StockMovementRow[]>([]);
  const [movementTotal, setMovementTotal] = React.useState(0);
  const [movementLoading, setMovementLoading] = React.useState(true);
  const [movementError, setMovementError] = React.useState<string | null>(null);
  const [movementType, setMovementType] = React.useState("all");
  const [movementBranch, setMovementBranch] = React.useState("all");
  const [productOptions, setProductOptions] = React.useState<{ value: string; label: string }[]>([]);
  const [movementProduct, setMovementProduct] = React.useState(presetProduct || "all");
  const [flow, setFlow] = React.useState<{ stockIn: number; stockOut: number }>({ stockIn: 0, stockOut: 0 });

  const loadOverview = React.useCallback(async () => {
    if (!orgId) {
      setOverviewLoading(false);
      return;
    }
    setOverviewLoading(true);
    setOverviewError(null);
    const result = await fetchStockOverview(orgId);
    setOverviewLoading(false);
    if (result.error) {
      setOverviewError(result.error.message);
      return;
    }
    setOverview(result.data);
  }, [orgId]);

  const loadMovements = React.useCallback(async () => {
    if (!orgId) {
      setMovementLoading(false);
      return;
    }
    setMovementLoading(true);
    setMovementError(null);
    const result = await fetchStockMovements({
      organizationId: orgId,
      movementType,
      branchId: movementBranch,
      productId: movementProduct === "all" ? undefined : movementProduct,
      pageSize: 50,
    });
    setMovementLoading(false);
    if (result.error) {
      setMovementError(result.error.message);
      return;
    }
    setMovements(result.data.rows);
    setMovementTotal(result.data.total);
  }, [orgId, movementType, movementBranch, movementProduct]);

  React.useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  React.useEffect(() => {
    if (!orgId) return;
    void fetchStockFlow(orgId, { days: 30 }).then((result) => {
      if (result.data) setFlow({ stockIn: result.data.stockIn, stockOut: result.data.stockOut });
    });
  }, [orgId]);

  React.useEffect(() => {
    if (!orgId) return;
    void loadPosProducts(orgId).then((products) =>
      setProductOptions([
        { value: "all", label: "All products" },
        ...products.map((product) => ({ value: product.id, label: product.name })),
      ]),
    );
  }, [orgId]);

  React.useEffect(() => {
    if (tab === "movements") void loadMovements();
  }, [tab, loadMovements]);

  const filteredOverview = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    return overview.filter((row) => {
      if (lowOnly && !row.isLow) return false;
      if (!term) return true;
      return (
        row.name.toLowerCase().includes(term) ||
        (row.sku ?? "").toLowerCase().includes(term) ||
        (row.category ?? "").toLowerCase().includes(term)
      );
    });
  }, [overview, search, lowOnly]);

  const lowCount = overview.filter((row) => row.isLow).length;
  const trackedCount = overview.filter((row) => row.trackStock).length;
  const stockValue = overview.reduce((sum, row) => sum + row.stockValue, 0);

  const overviewColumns: Column<StockOverviewRow>[] = [
    { id: "name", header: "Product", cell: (row) => row.name },
    { id: "sku", header: "SKU", cell: (row) => row.sku ?? "—" },
    { id: "category", header: "Category", cell: (row) => row.category ?? "—" },
    {
      id: "stock",
      header: "On hand",
      align: "right",
      cell: (row) => (row.trackStock ? `${row.stockQuantity} ${row.unit}` : "Not tracked"),
    },
    { id: "reorder", header: "Reorder at", align: "right", cell: (row) => row.reorderLevel },
    {
      id: "value",
      header: "Stock value",
      align: "right",
      cell: (row) => formatCurrency(row.stockValue, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) =>
        !row.trackStock ? (
          <Badge tone="neutral">Not tracked</Badge>
        ) : row.isLow ? (
          <Badge tone="warning">Low stock</Badge>
        ) : (
          <Badge tone="success">In stock</Badge>
        ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={(event) => {
            event.stopPropagation();
            setTab("movements");
            setMovementProduct(row.productId);
          }}
        >
          <History aria-hidden="true" className="size-4" />
          History
        </Button>
      ),
    },
  ];

  const movementColumns: Column<StockMovementRow>[] = [
    { id: "date", header: "When", cell: (row) => formatDateTime(row.createdAt) },
    { id: "product", header: "Product", cell: (row) => row.productName },
    { id: "type", header: "Type", cell: (row) => STOCK_MOVEMENT_TYPE_LABELS[row.movementType] ?? row.movementType },
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
    { id: "reference", header: "Reference", cell: (row) => row.notes ?? row.referenceType ?? "—" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock"
        description="Live stock levels and every movement in and out."
        icon={Boxes}
        actions={
          <div className="flex gap-2">
            <ButtonLink href="/inventory/purchases/new" variant="outline">
              <Truck aria-hidden="true" className="size-4" />
              New purchase
            </ButtonLink>
            <ButtonLink href="/pos/new-sale">
              <PackageSearch aria-hidden="true" className="size-4" />
              Sell product
            </ButtonLink>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Products" value={String(overview.length)} hint={`${trackedCount} tracked`} tone="primary" />
        <StatCard
          label="Low stock"
          value={String(lowCount)}
          hint={lowCount ? "At or below reorder level" : "Everything is healthy"}
          tone={lowCount ? "warning" : "neutral"}
        />
        <StatCard label="Stock value" value={formatCurrency(stockValue, currency)} />
        <StatCard
          label="Stock in (30d)"
          value={String(flow.stockIn)}
          hint="Units received"
          tone="primary"
        />
        <StatCard label="Stock out (30d)" value={String(flow.stockOut)} hint="Units sold or used" />
      </div>

      <Tabs
        value={tab}
        onValueChange={setTab}
        items={[
          { value: "overview", label: "Levels", icon: PackageSearch },
          { value: "movements", label: "Movements", icon: History, badge: movementTotal || undefined },
        ]}
      />

      {tab === "overview" ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <SearchBar
              value={search}
              onValueChange={setSearch}
              placeholder="Search products"
              aria-label="Search stock"
            />
            <label className="inline-flex items-center gap-2 text-sm text-neutral-600">
              <input
                type="checkbox"
                className="size-4 rounded border-border"
                checked={lowOnly}
                onChange={(event) => setLowOnly(event.target.checked)}
              />
              Low stock only
            </label>
          </div>
          {overviewError ? (
            <ErrorState description={overviewError} onRetry={() => void loadOverview()} />
          ) : (
            <DataTable
              columns={overviewColumns}
              data={filteredOverview}
              rowKey={(row) => row.productId}
              loading={overviewLoading}
              emptyTitle="No products yet"
              emptyDescription="Add products to track their stock."
              emptyAction={
                <ButtonLink href="/inventory/products/add" variant="outline">
                  Add product
                </ButtonLink>
              }
              onRowClick={(row) => router.push(`/inventory/products/${row.productId}`)}
            />
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <FilterBar
            activeCount={
              [movementType !== "all", movementBranch !== "all", movementProduct !== "all"].filter(Boolean)
                .length
            }
            onClear={() => {
              setMovementType("all");
              setMovementBranch("all");
              setMovementProduct("all");
            }}
          >
            <Select
              aria-label="Movement type"
              className="w-full sm:w-44"
              value={movementType}
              onChange={(event) => setMovementType(event.target.value)}
              options={MOVEMENT_TYPE_OPTIONS}
            />
            <Select
              aria-label="Product"
              className="w-full sm:w-52"
              value={movementProduct}
              onChange={(event) => setMovementProduct(event.target.value)}
              options={productOptions}
            />
            <Select
              aria-label="Branch"
              className="w-full sm:w-48"
              value={movementBranch}
              onChange={(event) => setMovementBranch(event.target.value)}
              options={[
                { value: "all", label: "All branches" },
                ...branches.map((branch) => ({
                  value: branch.id,
                  label: `${branch.name} (${branch.code})`,
                })),
              ]}
            />
          </FilterBar>
          {movementError ? (
            <ErrorState description={movementError} onRetry={() => void loadMovements()} />
          ) : (
            <DataTable
              columns={movementColumns}
              data={movements}
              rowKey={(row) => row.id}
              loading={movementLoading}
              emptyTitle="No stock movements"
              emptyDescription="Receive a purchase or make a sale to see stock move here."
              emptyAction={
                <ButtonLink href="/inventory/purchases/new" variant="outline">
                  New purchase
                </ButtonLink>
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
