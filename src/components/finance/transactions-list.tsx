"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowUpRight, ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Select } from "@/components/ui/select";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchFinanceSnapshot } from "@/lib/finance/client";
import { defaultFinanceRange } from "@/lib/finance/utils";
import {
  FINANCE_SOURCE_LABELS,
  FINANCE_SOURCE_TONES,
  FINANCE_SOURCES,
  buildTransactions,
  type FinanceSource,
  type FinanceTransaction,
} from "@/lib/finance/types";

const SOURCE_OPTIONS = [
  { value: "all", label: "All sources" },
  ...FINANCE_SOURCES.map((source) => ({
    value: source,
    label: FINANCE_SOURCE_LABELS[source],
  })),
];

const DIRECTION_OPTIONS = [
  { value: "all", label: "In and out" },
  { value: "in", label: "Money in" },
  { value: "out", label: "Money out" },
];

export function TransactionsList() {
  const router = useRouter();
  const { organization, branches } = useOrganization();
  const orgId = organization?.id;
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);

  const [rows, setRows] = React.useState<FinanceTransaction[]>([]);
  const [source, setSource] = React.useState("all");
  const [direction, setDirection] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchFinanceSnapshot({
      organizationId: orgId,
      branchId: branchId === "all" ? undefined : branchId,
      from: from || undefined,
      to: to || undefined,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(buildTransactions(result.data));
  }, [orgId, branchId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const filtered = React.useMemo(
    () =>
      rows.filter((row) => {
        if (source !== "all" && row.source !== (source as FinanceSource)) return false;
        if (direction !== "all" && row.direction !== direction) return false;
        return true;
      }),
    [rows, source, direction],
  );

  const columns: Column<FinanceTransaction>[] = [
    {
      id: "date",
      header: "Date",
      cell: (row) => formatDate(row.date.slice(0, 10)),
    },
    {
      id: "source",
      header: "Source",
      cell: (row) => <Badge tone={FINANCE_SOURCE_TONES[row.source]}>{FINANCE_SOURCE_LABELS[row.source]}</Badge>,
    },
    { id: "reference", header: "Reference", cell: (row) => row.reference },
    { id: "description", header: "Description", cell: (row) => row.description },
    { id: "branch", header: "Branch", cell: (row) => row.branchName || "—" },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => (
        <span className={row.direction === "in" ? "text-emerald-700" : "text-red-700"}>
          {row.direction === "in" ? "+" : "−"}
          {formatMoney(row.amount)}
        </span>
      ),
    },
    {
      id: "dir",
      header: "",
      align: "right",
      cell: (row) =>
        row.direction === "in" ? (
          <ArrowUpRight aria-hidden="true" className="size-4 text-emerald-600" />
        ) : (
          <ArrowDownRight aria-hidden="true" className="size-4 text-red-600" />
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Transactions"
        description="Each row is the original expense, income, payment, POS sale, purchase or refund."
        icon={ReceiptText}
        actions={<ButtonLink href="/finance" variant="outline">Back to finance</ButtonLink>}
      />

      <FinanceScopeFilters
        from={from}
        to={to}
        branchId={branchId}
        branches={branches}
        onFromChange={setFrom}
        onToChange={setTo}
        onBranchChange={setBranchId}
        onClear={() => {
          const range = defaultFinanceRange();
          setFrom(range.from);
          setTo(range.to);
          setBranchId("all");
          setSource("all");
          setDirection("all");
        }}
      >
        <Select
          aria-label="Source"
          className="w-full sm:w-48"
          value={source}
          onChange={(event) => setSource(event.target.value)}
          options={SOURCE_OPTIONS}
        />
        <Select
          aria-label="Direction"
          className="w-full sm:w-40"
          value={direction}
          onChange={(event) => setDirection(event.target.value)}
          options={DIRECTION_OPTIONS}
        />
      </FinanceScopeFilters>

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={filtered}
          rowKey={(row) => row.key}
          loading={loading}
          onRowClick={(row) => router.push(row.href)}
          emptyTitle="No transactions in this range"
          emptyDescription="Record an expense, other income, invoice payment or POS sale to populate this ledger."
        />
      )}
    </div>
  );
}
