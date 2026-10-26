"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CirclePlus } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { Select } from "@/components/ui/select";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchIncomeEntries, fetchFinanceCategories } from "@/lib/finance/client";
import { defaultFinanceRange } from "@/lib/finance/utils";
import type { IncomeEntryRow } from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { categoryOptions, INCOME_CATEGORY_SUGGESTIONS } from "@/lib/finance/categories";

export function IncomeList() {
  const router = useRouter();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);

  const [rows, setRows] = React.useState<IncomeEntryRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [category, setCategory] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [categoryOptionsList, setCategoryOptionsList] = React.useState(
    categoryOptions([], INCOME_CATEGORY_SUGGESTIONS),
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
    const result = await fetchIncomeEntries({
      organizationId: orgId,
      search,
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
  }, [orgId, search, category, branchId, from, to, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!orgId) return;
    void fetchFinanceCategories(orgId).then((result) => {
      if (result.data) {
        setCategoryOptionsList(categoryOptions(result.data.income, INCOME_CATEGORY_SUGGESTIONS));
      }
    });
  }, [orgId]);

  const columns: Column<IncomeEntryRow>[] = [
    { id: "date", header: "Date", cell: (row) => formatDate(row.incomeDate) },
    { id: "category", header: "Category", cell: (row) => row.category },
    { id: "description", header: "Description", cell: (row) => row.description ?? "—" },
    { id: "branch", header: "Branch", cell: (row) => row.branchName },
    {
      id: "method",
      header: "Received via",
      cell: (row) => PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod,
    },
    {
      id: "amount",
      header: "Amount",
      align: "right",
      cell: (row) => formatMoney(row.amount),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => (
        <RowActions
          label={`Actions for ${row.category}`}
          items={[
            { label: "View", href: `/finance/income/${row.id}` },
            ...(canManage ? [{ label: "Edit", href: `/finance/income/${row.id}/edit` }] : []),
          ]}
        />
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Other income"
        description="Manual receipts that are not invoice payments or POS sales."
        icon={CirclePlus}
        actions={
          canManage ? (
            <ButtonLink href="/finance/income/new">
              <CirclePlus aria-hidden="true" className="size-4" />
              Add Income
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
          aria-label="Search income"
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
            setCategory("all");
            setPage(1);
          }}
        >
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
          onRowClick={(row) => router.push(`/finance/income/${row.id}`)}
          emptyTitle="No other income yet"
          emptyDescription="Record miscellaneous receipts that are not invoice payments or POS sales."
          emptyAction={
            canManage ? (
              <ButtonLink href="/finance/income/new" variant="outline">
                Add Income
              </ButtonLink>
            ) : undefined
          }
        />
      )}
    </div>
  );
}
