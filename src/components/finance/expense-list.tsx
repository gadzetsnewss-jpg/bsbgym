"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { Select } from "@/components/ui/select";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchExpenses, fetchFinanceCategories } from "@/lib/finance/client";
import { defaultFinanceRange } from "@/lib/finance/utils";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  type ExpenseRow,
} from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { categoryOptions, EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/finance/categories";

const STATUS_OPTIONS = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Pending" },
];

export function ExpenseList() {
  const router = useRouter();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);

  const [rows, setRows] = React.useState<ExpenseRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [category, setCategory] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [categoryOptionsList, setCategoryOptionsList] = React.useState(
    categoryOptions([], EXPENSE_CATEGORY_SUGGESTIONS),
  );
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchExpenses({
      organizationId: orgId,
      search,
      status,
      category,
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
  }, [orgId, search, status, category, branchId, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!orgId) return;
    void fetchFinanceCategories(orgId).then((result) => {
      if (result.data) {
        setCategoryOptionsList(categoryOptions(result.data.expense, EXPENSE_CATEGORY_SUGGESTIONS));
      }
    });
  }, [orgId]);

  const columns: Column<ExpenseRow>[] = [
    { id: "date", header: "Date", cell: (row) => formatDate(row.expenseDate) },
    { id: "category", header: "Category", cell: (row) => row.category },
    { id: "description", header: "Description", cell: (row) => row.description ?? "—" },
    { id: "branch", header: "Branch", cell: (row) => row.branchName },
    {
      id: "method",
      header: "Paid with",
      cell: (row) => PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatMoney(row.amount),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <Badge tone={EXPENSE_STATUS_TONES[row.status] ?? "neutral"}>
          {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
        </Badge>
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.category}`}
          items={[
            { label: "View", href: `/finance/expenses/${row.id}` },
            ...(canManage ? [{ label: "Edit", href: `/finance/expenses/${row.id}/edit` }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Expenses"
        description="Operating costs such as rent, salaries and utilities."
        icon={Wallet}
        actions={
          canManage ? (
            <ButtonLink href="/finance/expenses/new">
              <ReceiptText aria-hidden="true" className="size-4" />
              Add Expense
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
          placeholder="Search description, category or reference"
          aria-label="Search expenses"
        />
        <FinanceScopeFilters
          className="flex-1"
          from={from}
          to={to}
          branchId={branchId}
          branches={branches}
          onFromChange={(value) => {
            setFrom(value);
            setPage(1);
          }}
          onToChange={(value) => {
            setTo(value);
            setPage(1);
          }}
          onBranchChange={(value) => {
            setBranchId(value);
            setPage(1);
          }}
          onClear={() => {
            const range = defaultFinanceRange();
            setFrom(range.from);
            setTo(range.to);
            setBranchId("all");
            setStatus("all");
            setCategory("all");
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
            aria-label="Category"
            className="w-full sm:w-44"
            value={category}
            onChange={(event) => {
              setCategory(event.target.value);
              setPage(1);
            }}
            options={[{ value: "all", label: "All categories" }, ...categoryOptionsList]}
          />
        </FinanceScopeFilters>
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
          onRowClick={(row) => router.push(`/finance/expenses/${row.id}`)}
          emptyTitle="No expenses yet"
          emptyDescription="Record rent, salaries or other operating costs."
          emptyAction={
            canManage ? (
              <ButtonLink href="/finance/expenses/new" variant="outline">
                Add Expense
              </ButtonLink>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
