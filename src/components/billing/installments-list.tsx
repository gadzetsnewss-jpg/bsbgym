"use client";

import * as React from "react";
import { CalendarRange } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { Modal } from "@/components/ui/modal";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchInstallments } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import { humanStatus } from "@/components/billing/status-copy";
import type { InstallmentRow } from "@/lib/billing/types";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "upcoming", label: "Upcoming" },
  { value: "due", label: "Due" },
  { value: "overdue", label: "Overdue" },
  { value: "partially_paid", label: "Partially Paid" },
  { value: "paid", label: "Paid" },
];

export function InstallmentsList() {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [rows, setRows] = React.useState<InstallmentRow[]>([]);
  const [status, setStatus] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payRow, setPayRow] = React.useState<InstallmentRow | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchInstallments(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = rows.filter((row) => status === "all" || row.status === status);

  const columns: Column<InstallmentRow>[] = [
    { id: "invoice", header: "Invoice", cell: (row) => row.invoiceNumber },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    { id: "due", header: "Due date", cell: (row) => formatDate(row.dueDate) },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatCurrency(row.amount, currency),
    },
    {
      id: "paid",
      header: "Paid",
      align: "right",
      cell: (row) => formatCurrency(row.paidAmount, currency),
    },
    {
      id: "remaining",
      header: "Remaining",
      align: "right",
      cell: (row) => formatCurrency(row.remaining, currency),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={humanStatus(row.status)} />,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for installment ${row.id}`}
          items={[
            { label: "View invoice", href: `/billing/invoices/${row.invoiceId}` },
            ...(can("payments.create") && row.remaining > 0
              ? [{ label: "Record payment", onClick: () => setPayRow(row) }]
              : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Installments"
        description="Split-payment schedules against invoices."
        icon={CalendarRange}
      />
      <FilterBar
        activeCount={status !== "all" ? 1 : 0}
        onClear={() => setStatus("all")}
      >
        <Select
          aria-label="Status"
          className="w-full sm:w-44"
          value={status}
          onChange={(event) => setStatus(event.target.value)}
          options={STATUS_OPTIONS}
        />
      </FilterBar>
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={visible}
          rowKey={(row) => row.id}
          loading={loading}
          emptyTitle="No installment schedules"
          emptyDescription="Create a schedule from an issued invoice."
        />
      )}
      <Modal
        open={Boolean(payRow)}
        onClose={() => setPayRow(null)}
        title="Record installment payment"
        description={payRow ? `${payRow.invoiceNumber} · ${payRow.memberName}` : undefined}
      >
        {payRow && (
          <RecordPaymentForm
            invoiceId={payRow.invoiceId}
            balance={payRow.remaining}
            onDone={() => {
              setPayRow(null);
              void load();
            }}
          />
        )}
      </Modal>
    </div>
  );
}
