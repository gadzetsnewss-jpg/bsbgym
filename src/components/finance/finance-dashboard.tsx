"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import {
  ArrowRight,
  Banknote,
  CirclePlus,
  FileText,
  Landmark,
  ReceiptText,
  ShoppingCart,
  TrendingDown,
  TrendingUp,
  Truck,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchFinanceDashboard } from "@/lib/finance/client";
import { defaultFinanceRange } from "@/lib/finance/utils";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  type FinanceDashboard,
} from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { cn } from "@/lib/utils";

function StatCard({
  label,
  value,
  hint,
  tone = "neutral",
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "neutral" | "warning" | "success" | "primary";
  icon: LucideIcon;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              tone === "warning" && "bg-amber-50 text-amber-600",
              tone === "success" && "bg-emerald-50 text-emerald-600",
              tone === "primary" && "bg-primary-50 text-primary-700",
              tone === "neutral" && "bg-neutral-100 text-neutral-500",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold",
          tone === "warning" && "text-amber-700",
          tone === "success" && "text-emerald-700",
          tone === "primary" && "text-primary-800",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}

function RecentRow({
  title,
  subtitle,
  amount,
  href,
  badge,
}: {
  title: string;
  subtitle: string;
  amount: string;
  href: string;
  badge?: React.ReactNode;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <div className="min-w-0">
        <Link href={href} className="truncate font-medium text-ink hover:underline">
          {title}
        </Link>
        <p className="truncate text-xs text-neutral-500">{subtitle}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <p className="tabular-nums">{amount}</p>
        {badge}
      </div>
    </li>
  );
}

export function FinanceDashboardScreen() {
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);

  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [branchId, setBranchId] = React.useState("all");
  const [data, setData] = React.useState<FinanceDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchFinanceDashboard({
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
    setData(result.data);
  }, [orgId, branchId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const scopeLabel = `${formatDate(from)} – ${formatDate(to)}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance"
        description="A reliable overview of money collected, receivables, costs and other income."
        icon={Wallet}
        actions={
          <>
            {canManage && (
              <ButtonLink href="/finance/expenses/new">
                <ReceiptText aria-hidden="true" className="size-4" />
                Add Expense
              </ButtonLink>
            )}
            {canManage && (
              <ButtonLink href="/finance/income/new" variant="outline">
                <CirclePlus aria-hidden="true" className="size-4" />
                Add Income
              </ButtonLink>
            )}
            <ButtonLink href="/finance/transactions" variant="outline">
              View Transactions
            </ButtonLink>
          </>
        }
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
        }}
      />

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !data ? (
        <LoadingState label="Loading finance…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Cash collected"
              value={formatMoney(data.collectedTotal)}
              hint="Invoice payments + POS sales + other income"
              tone="success"
              icon={Banknote}
            />
            <StatCard
              label="Invoiced"
              value={formatMoney(data.invoicedTotal)}
              hint="Issued invoices in range — not cash received"
              icon={FileText}
            />
            <StatCard
              label="Outstanding"
              value={formatMoney(data.outstanding)}
              hint="Unpaid invoice balance — a receivable, not cash"
              tone="warning"
              icon={Landmark}
            />
            <StatCard
              label="Net cash movement"
              value={formatMoney(data.netCash)}
              hint="Collected − paid expenses − processed refunds"
              tone="primary"
              icon={TrendingUp}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Operating expenses"
              value={formatMoney(data.expensesPaid)}
              hint={`${data.expenseCount} recorded · ${formatMoney(data.expensesPending)} pending`}
              tone="warning"
              icon={TrendingDown}
            />
            <StatCard
              label="Other income"
              value={formatMoney(data.otherIncomeTotal)}
              hint={`${data.incomeCount} manual entries`}
              tone="success"
              icon={CirclePlus}
            />
            <StatCard
              label="POS sales"
              value={formatMoney(data.posSalesTotal)}
              hint={`${data.posSaleCount} completed sales`}
              icon={ShoppingCart}
            />
            <StatCard
              label="Purchase costs"
              value={formatMoney(data.purchaseTotal)}
              hint={`${data.purchaseCount} stock receipts — never copied as expenses`}
              icon={Truck}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle>How cash is calculated</CardTitle>
              </CardHeader>
              <div className="space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-600">Invoice payments</span>
                  <span className="tabular-nums">{formatMoney(data.paymentsCollected)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-600">POS sales collected</span>
                  <span className="tabular-nums">{formatMoney(data.posSalesTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-600">Other income</span>
                  <span className="tabular-nums">{formatMoney(data.otherIncomeTotal)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2">
                  <span className="text-neutral-600">Paid expenses</span>
                  <span className="tabular-nums text-red-600">−{formatMoney(data.expensesPaid)}</span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-neutral-600">Processed refunds</span>
                  <span className="tabular-nums text-red-600">−{formatMoney(data.refundsProcessed)}</span>
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-border pt-2 font-semibold">
                  <span>Net cash movement</span>
                  <span className="tabular-nums">{formatMoney(data.netCash)}</span>
                </div>
              </div>
              <p className="mt-3 text-xs text-neutral-500">
                Cash movement is not profit. Received purchase costs are shown separately and are
                not auto-created as expenses.
              </p>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent expenses</CardTitle>
                <Link href="/finance/expenses" className="text-xs font-medium text-primary-700 hover:underline">
                  View all
                </Link>
              </CardHeader>
              {data.recentExpenses.length === 0 ? (
                <EmptyState
                  icon={ReceiptText}
                  title="No expenses yet"
                  description="Record rent, salaries or utilities to see them here."
                  action={canManage ? { label: "Add expense", href: "/finance/expenses/new" } : undefined}
                />
              ) : (
                <ul className="space-y-3">
                  {data.recentExpenses.map((row) => (
                    <RecentRow
                      key={row.id}
                      title={row.category}
                      subtitle={`${row.description ?? row.branchName} · ${formatDate(row.expenseDate)}`}
                      amount={formatMoney(row.amount)}
                      href={`/finance/expenses/${row.id}`}
                      badge={
                        <Badge tone={EXPENSE_STATUS_TONES[row.status] ?? "neutral"}>
                          {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
                        </Badge>
                      }
                    />
                  ))}
                </ul>
              )}
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Recent other income</CardTitle>
                <Link href="/finance/income" className="text-xs font-medium text-primary-700 hover:underline">
                  View all
                </Link>
              </CardHeader>
              {data.recentIncome.length === 0 ? (
                <EmptyState
                  icon={CirclePlus}
                  title="No other income yet"
                  description="Record miscellaneous receipts that are not invoice payments."
                  action={canManage ? { label: "Add income", href: "/finance/income/new" } : undefined}
                />
              ) : (
                <ul className="space-y-3">
                  {data.recentIncome.map((row) => (
                    <RecentRow
                      key={row.id}
                      title={row.category}
                      subtitle={`${row.description ?? row.branchName} · ${formatDate(row.incomeDate)}`}
                      amount={formatMoney(row.amount)}
                      href={`/finance/income/${row.id}`}
                    />
                  ))}
                </ul>
              )}
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Recent payments collected</CardTitle>
              <Link href="/billing/payments" className="text-xs font-medium text-primary-700 hover:underline">
                All payments
              </Link>
            </CardHeader>
            {data.recentPayments.length === 0 ? (
              <EmptyState
                icon={Banknote}
                title="No payments in this range"
                description="Invoice payments recorded in Billing appear here."
              />
            ) : (
              <ul className="space-y-3">
                {data.recentPayments.map((row) => (
                  <RecentRow
                    key={row.id}
                    title={row.invoiceNumber ?? "Invoice payment"}
                    subtitle={`${row.memberName ?? "Member"} · ${
                      PAYMENT_METHOD_LABELS[row.method] ?? row.method
                    } · ${formatDate(row.paidAt)}`}
                    amount={formatMoney(row.amount)}
                    href={row.invoiceId ? `/billing/invoices/${row.invoiceId}` : "/billing/payments"}
                  />
                ))}
              </ul>
            )}
          </Card>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-border bg-surface-muted/60 px-4 py-3 text-sm text-neutral-600">
            <span>
              Showing {scopeLabel}
              {branchId !== "all"
                ? ` · ${branches.find((branch) => branch.id === branchId)?.name ?? "selected branch"}`
                : " · all branches"}
            </span>
            <Link
              href="/finance/transactions"
              className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline"
            >
              Open the transaction ledger
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </div>
        </>
      )}
    </div>
  );
}
