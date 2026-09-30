"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { ErrorState } from "@/components/ui/error-state";
import { StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchOpenInvoices, fetchPayments } from "@/lib/billing/client";
import { formatCurrency, formatDateTime } from "@/lib/format";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";

export function PaymentsList() {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<PaymentRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [method, setMethod] = React.useState("all");
  const [from, setFrom] = React.useState("");
  const [to, setTo] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [open, setOpen] = React.useState(false);
  const [openInvoices, setOpenInvoices] = React.useState<InvoiceRow[]>([]);
  const [invoiceId, setInvoiceId] = React.useState("");

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchPayments(orgId, { search, method, from, to, page, pageSize: 20 });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
    setTotal(result.data.total);
  }, [orgId, search, method, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openRecorder = async () => {
    if (!orgId) return;
    const result = await fetchOpenInvoices(orgId);
    setOpenInvoices(result.data ?? []);
    setInvoiceId(result.data?.[0]?.id ?? "");
    setOpen(true);
  };

  const selected = openInvoices.find((row) => row.id === invoiceId);

  const columns: Column<PaymentRow>[] = [
    { id: "date", header: "Date", cell: (row) => formatDateTime(row.paidAt) },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    {
      id: "invoice",
      header: "Invoice",
      cell: (row) => row.invoiceNumber ?? "—",
    },
    {
      id: "method",
      header: "Method",
      cell: (row) => PAYMENT_METHOD_LABELS[row.method] ?? row.method,
    },
    { id: "reference", header: "Reference", cell: (row) => row.reference ?? "—" },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatCurrency(row.amount, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: () => <StatusBadge status="Recorded" />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for payment ${row.id}`}
          items={[
            ...(row.invoiceId
              ? [{ label: "View invoice", href: `/billing/invoices/${row.invoiceId}` }]
              : []),
            { label: "Print receipt", href: `/billing/payments/${row.id}/print` },
            ...(can("billing.refund")
              ? [{ label: "Request refund", href: `/billing/refunds?paymentId=${row.id}` }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Recorded collections against invoices."
        icon={CreditCard}
        actions={
          can("payments.create") ? (
            <Button onClick={() => void openRecorder()}>Record payment</Button>
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
          placeholder="Search reference"
          aria-label="Search payments"
        />
        <FilterBar
          className="flex-1"
          activeCount={[method !== "all", Boolean(from), Boolean(to)].filter(Boolean).length}
          onClear={() => {
            setMethod("all");
            setFrom("");
            setTo("");
            setPage(1);
          }}
        >
          <Select
            aria-label="Method"
            className="w-full sm:w-44"
            value={method}
            onChange={(event) => {
              setMethod(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All methods" },
              ...PAYMENT_METHODS.map((item) => ({ value: item, label: PAYMENT_METHOD_LABELS[item] })),
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
          emptyTitle="No payments yet"
          emptyDescription="Record a payment against an issued invoice."
        />
      )}

      <Modal open={open} onClose={() => setOpen(false)} title="Record payment">
        {openInvoices.length === 0 ? (
          <p className="text-sm text-neutral-500">There are no open invoices to collect against.</p>
        ) : (
          <div className="space-y-4">
            <FormField label="Invoice" required>
              <Select
                value={invoiceId}
                onChange={(event) => setInvoiceId(event.target.value)}
                options={openInvoices.map((row) => ({
                  value: row.id,
                  label: `${row.invoiceNumber} · ${row.memberName} · ${formatCurrency(row.balance, currency)}`,
                }))}
              />
            </FormField>
            {selected && (
              <RecordPaymentForm
                invoiceId={selected.id}
                memberLabel={selected.memberName}
                balance={selected.balance}
                onDone={() => {
                  setOpen(false);
                  void load();
                }}
              />
            )}
          </div>
        )}
      </Modal>
    </div>
  );
}
