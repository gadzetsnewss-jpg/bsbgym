"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { RowActions } from "@/components/ui/row-actions";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchRecentPaymentsLive } from "@/lib/dashboard/client";
import type { PaymentMethod } from "@/types/dashboard";

const columns: Column<PaymentMethod>[] = [
  {
    id: "invoice",
    header: "Invoice",
    cell: (row) => (
      <span className="font-medium whitespace-nowrap text-ink">{row.invoice}</span>
    ),
  },
  {
    id: "member",
    header: "Member",
    cell: (row) => <span className="whitespace-nowrap">{row.member}</span>,
  },
  {
    id: "amount",
    header: "Amount",
    align: "right",
    cell: (row) => (
      <span className="font-semibold whitespace-nowrap text-ink">{row.amount}</span>
    ),
  },
  {
    id: "method",
    header: "Method",
    cell: (row) => <span className="whitespace-nowrap text-neutral-500">{row.method}</span>,
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: "date",
    header: "Date",
    cell: (row) => <span className="whitespace-nowrap text-neutral-500">{row.date}</span>,
  },
];

export function RecentPayments({ className }: { className?: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("payments.view") || can("billing.view") || can("finance.view") || can("dashboard.view");
  const { currency, dateFormat, decimalPlaces } = useFinanceSettings();
  const [rows, setRows] = React.useState<PaymentMethod[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchRecentPaymentsLive(orgId, currency, dateFormat, decimalPlaces);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, canView, currency, dateFormat, decimalPlaces]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const actionColumns: Column<PaymentMethod>[] = [
    ...columns,
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.invoice}`}
          items={[
            {
              label: "View invoice",
              icon: Eye,
              href: "/billing/payments",
            },
          ]}
        />
      ),
    },
  ];

  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Recent Payments</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Latest invoice payments. POS sales are listed separately.
          </p>
        </div>
        <Link
          href="/billing/payments"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>
      {!canView ? (
        <div className="p-5">
          <EmptyState title="Payments are restricted" description="You do not have permission to view payments." />
        </div>
      ) : error ? (
        <div className="p-5">
          <ErrorState description={error} onRetry={() => void load()} />
        </div>
      ) : loading ? (
        <div className="p-5">
          <LoadingState label="Loading payments…" />
        </div>
      ) : rows.length === 0 ? (
        <div className="p-5">
          <EmptyState title="No invoice payments yet" description="Recorded invoice payments appear here." />
        </div>
      ) : (
        <DataTable columns={actionColumns} data={rows} rowKey={(row) => row.id} />
      )}
    </Card>
  );
}
