"use client";

import { cn } from "@/lib/utils";
import * as React from "react";
import Link from "next/link";
import { ArrowUpRight, Download, Eye } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { RowActions } from "@/components/ui/row-actions";
import { useToast } from "@/components/ui/toast";
import { RECENT_PAYMENTS } from "@/data/mock-dashboard";
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
  const { toast } = useToast();
  const [range, setRange] = React.useState("30d");

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
              onClick: () =>
                toast({
                  title: `Viewing ${row.invoice}`,
                  description: `${row.member} · ${row.amount}`,
                  variant: "info",
                }),
            },
            {
              label: "Download PDF",
              icon: Download,
              onClick: () =>
                toast({
                  title: "PDF export",
                  description: "Invoice downloads arrive with Phase 1.",
                  variant: "info",
                }),
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
            Latest collections across branches
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DateRangePicker value={range} onValueChange={setRange} />
          <Link
            href="/billing/payments"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
          >
            View all
            <ArrowUpRight aria-hidden="true" className="size-3.5" />
          </Link>
        </div>
      </CardHeader>
      <DataTable
        columns={actionColumns}
        data={RECENT_PAYMENTS}
        rowKey={(row) => row.id}
      />
    </Card>
  );
}
