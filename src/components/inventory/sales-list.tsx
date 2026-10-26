"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ShoppingBag, ShoppingCart } from "lucide-react";
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
import { fetchPosSales, voidPosSale } from "@/lib/inventory/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { POS_PAYMENT_METHOD_LABELS, type PosSaleRow } from "@/lib/inventory/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "completed", label: "Completed" },
  { value: "void", label: "Void" },
];

export function SalesList() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canSell = can("pos.create");

  const [rows, setRows] = React.useState<PosSaleRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [voidRow, setVoidRow] = React.useState<PosSaleRow | null>(null);
  const [busy, setBusy] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPosSales({
      organizationId: orgId,
      search,
      status,
      branchId,
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
  }, [orgId, search, status, branchId, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<PosSaleRow>[] = [
    { id: "number", header: "Receipt #", cell: (row) => row.saleNumber },
    { id: "when", header: "When", cell: (row) => formatDateTime(row.soldAt) },
    { id: "member", header: "Customer", cell: (row) => row.memberName ?? "Walk-in" },
    { id: "branch", header: "Branch", cell: (row) => row.branchName },
    {
      id: "method",
      header: "Payment",
      cell: (row) => POS_PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      cell: (row) => formatCurrency(row.total, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) =>
        row.status === "void" ? <Badge tone="danger">Void</Badge> : <Badge tone="success">Completed</Badge>,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.saleNumber}`}
          items={[
            { label: "Receipt", href: `/pos/sales/${row.id}` },
            ...(canSell && row.status === "completed"
              ? [
                  {
                    label: "Void sale",
                    variant: "danger" as const,
                    separator: true,
                    onClick: () => setVoidRow(row),
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
        title="Sales"
        description="Point-of-sale receipts and stock sold."
        icon={ShoppingBag}
        actions={
          canSell ? (
            <ButtonLink href="/pos/new-sale">
              <ShoppingCart aria-hidden="true" className="size-4" />
              New sale
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
          placeholder="Search receipt number"
          aria-label="Search sales"
        />
        <FilterBar
          className="flex-1"
          activeCount={
            [status !== "all", branchId !== "all", Boolean(from), Boolean(to)].filter(Boolean).length
          }
          onClear={() => {
            setStatus("all");
            setBranchId("all");
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          <Select
            aria-label="Status"
            className="w-full sm:w-40"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value);
              setPage(1);
            }}
            options={STATUS_OPTIONS}
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
          onRowClick={(row) => router.push(`/pos/sales/${row.id}`)}
          emptyTitle="No sales yet"
          emptyDescription="Ring up a product to see receipts here."
          emptyAction={
            canSell ? (
              <ButtonLink href="/pos/new-sale" variant="outline">
                New sale
              </ButtonLink>
            ) : undefined
          }
        />
      )}

      <ConfirmDialog
        open={Boolean(voidRow)}
        onClose={() => setVoidRow(null)}
        title="Void sale"
        description="Voiding returns the sold quantities to stock. The receipt is kept for your records."
        confirmLabel="Void sale"
        tone="danger"
        isLoading={busy}
        onConfirm={async () => {
          if (!voidRow) return;
          setBusy(true);
          const result = await voidPosSale(voidRow.id);
          setBusy(false);
          if (result.error) {
            toast({ title: "Could not void sale", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Sale voided", description: "Stock restored.", variant: "success" });
          setVoidRow(null);
          void load();
        }}
      />
    </div>
  );
}
