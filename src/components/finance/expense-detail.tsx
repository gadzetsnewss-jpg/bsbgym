"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { Pencil, ReceiptText, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchExpense } from "@/lib/finance/client";
import {
  EXPENSE_STATUS_LABELS,
  EXPENSE_STATUS_TONES,
  type ExpenseRow,
} from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";

export function ExpenseDetail({ expenseId }: { expenseId: string }) {
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved") === "1";
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { formatMoney, formatDate } = useFinanceSettings();

  const [row, setRow] = React.useState<ExpenseRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchExpense(orgId, expenseId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRow(result.data);
  }, [orgId, expenseId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading expense…" />;
  if (error || !row) {
    return <ErrorState description={error ?? "That expense could not be found."} onRetry={() => void load()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.category}
        description={row.description ?? "Recorded operating expense."}
        icon={Wallet}
        actions={
          <>
            {canManage && (
              <ButtonLink href={`/finance/expenses/${row.id}/edit`} variant="outline">
                <Pencil aria-hidden="true" className="size-4" />
                Edit
              </ButtonLink>
            )}
            <ButtonLink href="/finance/expenses" variant="outline">
              Back to expenses
            </ButtonLink>
          </>
        }
      />

      {saved && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800">Expense recorded successfully</p>
          <p className="mt-1 text-sm text-emerald-700">
            The expense is saved in history and included in the finance summary.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/finance/expenses/new" size="sm">
              <ReceiptText aria-hidden="true" className="size-4" />
              Add another expense
            </ButtonLink>
            <ButtonLink href="/finance" size="sm" variant="outline">
              View finance
            </ButtonLink>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Expense details</CardTitle>
          <Badge tone={EXPENSE_STATUS_TONES[row.status] ?? "neutral"}>
            {EXPENSE_STATUS_LABELS[row.status] ?? row.status}
          </Badge>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Date</dt>
              <dd className="mt-1 text-sm text-ink">{formatDate(row.expenseDate)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Amount</dt>
              <dd className="mt-1 text-sm font-semibold text-ink">{formatMoney(row.amount)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Branch</dt>
              <dd className="mt-1 text-sm text-ink">{row.branchName}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Paid with</dt>
              <dd className="mt-1 text-sm text-ink">
                {PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Reference</dt>
              <dd className="mt-1 text-sm text-ink">{row.reference ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Description</dt>
              <dd className="mt-1 text-sm text-ink">{row.description ?? "—"}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>
    </div>
  );
}
