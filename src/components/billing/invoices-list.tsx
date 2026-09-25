"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { FilePlus, FileText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchInvoices, voidInvoice } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/billing/types";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import { humanStatus } from "@/components/billing/status-copy";
import type { InvoiceRow } from "@/lib/billing/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "draft", label: "Draft" },
  { value: "issued", label: "Issued" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "void", label: "Cancelled" },
];

export function InvoicesList() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<InvoiceRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payRow, setPayRow] = React.useState<InvoiceRow | null>(null);
  const [voidRow, setVoidRow] = React.useState<InvoiceRow | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchInvoices({
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

  const columns: Column<InvoiceRow>[] = [
    { id: "number", header: "Invoice #", cell: (row) => row.invoiceNumber },
    { id: "date", header: "Date", cell: (row) => formatDate(row.issueDate) },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    {
      id: "description",
      header: "Description",
      cell: (row) => row.notes ?? row.branchName,
    },
    {
      id: "total",
      header: "Total",
      align: "right",
      cell: (row) => formatCurrency(row.total, currency),
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      cell: (row) => formatCurrency(row.amountPaid, currency),
    },
    {
      id: "balance",
      header: "Balance",
      align: "right",
      cell: (row) => formatCurrency(row.balance, currency),
    },
    { id: "due", header: "Due date", cell: (row) => formatDate(row.dueDate) },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={INVOICE_STATUS_LABELS[row.status] ?? humanStatus(row.status)} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.invoiceNumber}`}
          items={[
            { label: "View", href: `/billing/invoices/${row.id}` },
            { label: "Print", href: `/billing/invoices/${row.id}/print` },
            ...(can("payments.create") && row.balance > 0 && !["draft", "void", "paid"].includes(row.status)
              ? [{ label: "Record payment", onClick: () => setPayRow(row) }]
              : []),
            ...(can("billing.void") && !["void", "paid"].includes(row.status)
              ? [{ label: "Cancel", variant: "danger" as const, separator: true, onClick: () => setVoidRow(row) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoices"
        description="All invoices and their payment status."
        icon={FileText}
        actions={
          can("billing.create") ? (
            <ButtonLink href="/billing/new-invoice">
              <FilePlus aria-hidden="true" className="size-4" />
              New invoice
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
          placeholder="Search invoice number"
          aria-label="Search invoices"
        />
        <FilterBar
          className="flex-1"
          activeCount={[status !== "all", branchId !== "all", Boolean(from), Boolean(to)].filter(Boolean).length}
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
            className="w-full sm:w-44"
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
              ...branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` })),
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
          onRowClick={(row) => router.push(`/billing/invoices/${row.id}`)}
          emptyTitle="No invoices yet"
          emptyDescription="Create an invoice when a member is charged."
        />
      )}

      <Modal
        open={Boolean(payRow)}
        onClose={() => setPayRow(null)}
        title="Record payment"
        description={payRow ? `${payRow.invoiceNumber} · ${payRow.memberName}` : undefined}
      >
        {payRow && (
          <RecordPaymentForm
            invoiceId={payRow.id}
            balance={payRow.balance}
            onDone={() => {
              setPayRow(null);
              void load();
            }}
          />
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(voidRow)}
        onClose={() => setVoidRow(null)}
        title="Cancel invoice"
        description="Finalized financial records are cancelled, not deleted. Paid invoices cannot be cancelled."
        confirmLabel="Cancel invoice"
        tone="danger"
        onConfirm={async () => {
          if (!voidRow) return;
          const result = await voidInvoice(voidRow.id, "Cancelled from invoices list");
          if (result.error) {
            toast({ title: "Could not cancel invoice", description: result.error.message, variant: "error" });
            return;
          }
          toast({ title: "Invoice cancelled", variant: "success" });
          setVoidRow(null);
          void load();
        }}
      />
    </div>
  );
}
