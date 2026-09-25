"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Hourglass } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Modal } from "@/components/ui/modal";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchOutstanding } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { INVOICE_STATUS_LABELS } from "@/lib/billing/types";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";
import { humanStatus } from "@/components/billing/status-copy";
import type { InvoiceRow, OutstandingSummary } from "@/lib/billing/types";

export function OutstandingList() {
  const router = useRouter();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [data, setData] = React.useState<OutstandingSummary | null>(null);
  const [bucket, setBucket] = React.useState("all");
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [payRow, setPayRow] = React.useState<InvoiceRow | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchOutstanding(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setData(result.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading outstanding…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (!data) return <ErrorState description="Outstanding amounts could not be loaded." />;

  const today = new Date().toISOString().slice(0, 10);
  const rows = data.rows.filter((row) => {
    const due = row.dueDate ?? row.issueDate;
    if (bucket === "overdue") return due < today;
    if (bucket === "today") return due === today;
    if (bucket === "week") {
      const week = new Date();
      week.setDate(week.getDate() + 7);
      return due >= today && due <= week.toISOString().slice(0, 10);
    }
    return true;
  });

  const columns: Column<InvoiceRow>[] = [
    { id: "number", header: "Invoice #", cell: (row) => row.invoiceNumber },
    { id: "member", header: "Member", cell: (row) => row.memberName },
    { id: "due", header: "Due date", cell: (row) => formatDate(row.dueDate) },
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
            ...(can("payments.create")
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
        title="Outstanding"
        description="Unpaid and overdue invoice balances."
        icon={Hourglass}
      />
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={Hourglass} metric={{ id: "outstanding-total", label: "Total outstanding", value: formatCurrency(data.total, currency) }} />
        <KpiCard icon={Hourglass} tone="accent" metric={{ id: "outstanding-today", label: "Due today", value: formatCurrency(data.dueToday, currency) }} />
        <KpiCard icon={Hourglass} metric={{ id: "outstanding-week", label: "Due this week", value: formatCurrency(data.dueThisWeek, currency) }} />
        <KpiCard icon={Hourglass} tone="warning" metric={{ id: "outstanding-overdue", label: "Overdue", value: formatCurrency(data.overdue, currency) }} />
      </div>
      <Card className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
        <div><p className="text-xs text-neutral-500 uppercase">Current</p><p className="tabular-nums">{formatCurrency(data.aging.current, currency)}</p></div>
        <div><p className="text-xs text-neutral-500 uppercase">1-7 days</p><p className="tabular-nums">{formatCurrency(data.aging.days1to7, currency)}</p></div>
        <div><p className="text-xs text-neutral-500 uppercase">8-30 days</p><p className="tabular-nums">{formatCurrency(data.aging.days8to30, currency)}</p></div>
        <div><p className="text-xs text-neutral-500 uppercase">31-60 days</p><p className="tabular-nums">{formatCurrency(data.aging.days31to60, currency)}</p></div>
        <div><p className="text-xs text-neutral-500 uppercase">60+ days</p><p className="tabular-nums">{formatCurrency(data.aging.days60plus, currency)}</p></div>
      </Card>
      <FilterBar activeCount={bucket !== "all" ? 1 : 0} onClear={() => setBucket("all")}>
        <Select
          aria-label="Due bucket"
          className="w-full sm:w-48"
          value={bucket}
          onChange={(event) => setBucket(event.target.value)}
          options={[
            { value: "all", label: "All outstanding" },
            { value: "today", label: "Due today" },
            { value: "week", label: "Due this week" },
            { value: "overdue", label: "Overdue" },
          ]}
        />
      </FilterBar>
      <DataTable
        columns={columns}
        data={rows}
        rowKey={(row) => row.id}
        onRowClick={(row) => router.push(`/billing/invoices/${row.id}`)}
        emptyTitle="No outstanding invoices"
        emptyDescription="All issued invoices are fully paid or credited."
      />
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
    </div>
  );
}
