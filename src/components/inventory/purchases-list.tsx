"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { PackageCheck, Truck } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchPurchases, receivePurchase, cancelPurchase, loadSupplierOptions } from "@/lib/inventory/client";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  PURCHASE_STATUS_LABELS,
  PURCHASE_STATUS_TONES,
  type PurchaseRow,
} from "@/lib/inventory/types";
import type { SelectOption } from "@/components/ui/select";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "ordered", label: "Ordered" },
  { value: "received", label: "Received" },
  { value: "cancelled", label: "Cancelled" },
];

function StatusCell({ status }: { status: string }) {
  return (
    <Badge tone={PURCHASE_STATUS_TONES[status] ?? "neutral"}>
      {PURCHASE_STATUS_LABELS[status] ?? status}
    </Badge>
  );
}

export function PurchasesList() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canManage = can("inventory.manage");
  const presetSupplier = searchParams.get("supplierId") ?? "all";

  const [rows, setRows] = React.useState<PurchaseRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [supplierId, setSupplierId] = React.useState(presetSupplier);
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [supplierOptions, setSupplierOptions] = React.useState<SelectOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [receiveRow, setReceiveRow] = React.useState<PurchaseRow | null>(null);
  const [cancelRow, setCancelRow] = React.useState<PurchaseRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPurchases({
      organizationId: orgId,
      search,
      status,
      branchId,
      supplierId: supplierId === "all" ? undefined : supplierId,
      from,
      to,
      page,
      pageSize: 20,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
    setTotal(result.data.total);
  }, [orgId, search, status, branchId, supplierId, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!orgId) return;
    void loadSupplierOptions(orgId).then((options) =>
      setSupplierOptions([{ value: "all", label: "All suppliers" }, ...options]),
    );
  }, [orgId]);

  const columns: Column<PurchaseRow>[] = [
    { id: "number", header: "PO #", cell: (row) => row.purchaseNumber },
    { id: "date", header: "Order date", cell: (row) => formatDate(row.orderDate) },
    { id: "supplier", header: "Supplier", cell: (row) => row.supplierName ?? "—" },
    { id: "branch", header: "Branch", cell: (row) => row.branchName },
    {
      id: "total",
      header: "Total",
      align: "right",
      cell: (row) => formatCurrency(row.total, currency),
    },
    {
      id: "received",
      header: "Received",
      cell: (row) => (row.receivedDate ? formatDate(row.receivedDate) : "—"),
    },
    { id: "status", header: "Status", cell: (row) => <StatusCell status={row.status} /> },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.purchaseNumber}`}
          items={[
            { label: "View", href: `/inventory/purchases/${row.id}` },
            ...(canManage && ["draft", "ordered"].includes(row.status)
              ? [
                  { label: "Receive stock", onClick: () => setReceiveRow(row) },
                  {
                    label: "Cancel PO",
                    variant: "danger" as const,
                    separator: true,
                    onClick: () => setCancelRow(row),
                  },
                ]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Purchases"
        description="Purchase orders and stock receipts."
        icon={Truck}
        actions={
          canManage ? (
            <ButtonLink href="/inventory/purchases/new">
              <PackageCheck aria-hidden="true" className="size-4" />
              New purchase
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onValueChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          placeholder="Search PO number"
          aria-label="Search purchases"
        />
        <FilterBar
          className="flex-1"
          activeCount={
            [status !== "all", branchId !== "all", supplierId !== "all", Boolean(from), Boolean(to)].filter(
              Boolean,
            ).length
          }
          onClear={() => {
            setStatus("all");
            setBranchId("all");
            setSupplierId("all");
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          <Select
            aria-label="Status"
            className="w-full sm:w-44"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
          />
          <Select
            aria-label="Supplier"
            className="w-full sm:w-48"
            value={supplierId}
            onChange={(event) => {
              setSupplierId(event.target.value);
              setPage(1);
            }}
            options={supplierOptions}
          />
          <Select
            aria-label="Branch"
            className="w-full sm:w-48"
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((branch) => ({
                value: branch.id,
                label: `${branch.name} (${branch.code})`,
              })),
            ]}
          />
          <input
            type="date"
            aria-label="From date"
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={from}
            onChange={(event) => {
              setFrom(event.target.value);
              setPage(1);
            }}
          />
          <input
            type="date"
            aria-label="To date"
            className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
            value={to}
            onChange={(event) => {
              setTo(event.target.value);
              setPage(1);
            }}
          />
        </FilterBar>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          loading={loading}
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
          onRowClick={(row) => router.push(`/inventory/purchases/${row.id}`)}
          emptyTitle="No purchases yet"
          emptyDescription="Create a purchase order to bring stock in."
          emptyAction={
            canManage ? (
              <ButtonLink href="/inventory/purchases/new" variant="outline">
                New purchase
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(receiveRow)}
        onClose={() => setReceiveRow(null)}
        title="Receive stock"
        description="Receiving adds the ordered quantities to stock. This can only be done once per purchase."
        confirmLabel="Receive stock"
        isLoading={busy}
        onConfirm={async () => {
          if (!receiveRow) return;
          setBusy(true);
          const result = await receivePurchase(receiveRow.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not receive stock", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Stock received", description: `${receiveRow.purchaseNumber} added to inventory.`, variant: "success" });
          setReceiveRow(null);
          void load();
        }}
      />

      <ConfirmDialog
        open={Boolean(cancelRow)}
        onClose={() => setCancelRow(null)}
        title="Cancel purchase order"
        description="Purchase records are cancelled, not deleted. Received purchases cannot be cancelled."
        confirmLabel="Cancel PO"
        tone="danger"
        isLoading={busy}
        onConfirm={async () => {
          if (!cancelRow) return;
          setBusy(true);
          const result = await cancelPurchase(cancelRow.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not cancel purchase", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Purchase cancelled", variant: "success" });
          setCancelRow(null);
          void load();
        }}
      />
    </div>
  );
}
