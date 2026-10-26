"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CirclePlus, Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchIncomeEntry } from "@/lib/finance/client";
import type { IncomeEntryRow } from "@/lib/finance/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";

export function IncomeDetail({ entryId }: { entryId: string }) {
  const searchParams = useSearchParams();
  const saved = searchParams.get("saved") === "1";
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { formatMoney, formatDate } = useFinanceSettings();

  const [row, setRow] = React.useState<IncomeEntryRow | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchIncomeEntry(orgId, entryId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRow(result.data);
  }, [orgId, entryId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading income…" />;
  if (error || !row) {
    return (
      <ErrorState description={error ?? "That income entry could not be found."} onRetry={() => void load()} />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={row.category}
        description={row.description ?? "Recorded other income."}
        icon={CirclePlus}
        actions={
          <>
            {canManage && (
              <ButtonLink href={`/finance/income/${row.id}/edit`} variant="outline">
                <Pencil aria-hidden="true" className="size-4" />
                Edit
              </ButtonLink>
            )}
            <ButtonLink href="/finance/income" variant="outline">
              Back to income
            </ButtonLink>
          </>
        }
      />

      {saved && (
        <Card className="border-emerald-200 bg-emerald-50">
          <p className="text-sm font-medium text-emerald-800">Income recorded successfully</p>
          <p className="mt-1 text-sm text-emerald-700">
            This receipt is saved in history. Invoice payments and POS sales stay in their own ledgers.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <ButtonLink href="/finance/income/new" size="sm">
              <CirclePlus aria-hidden="true" className="size-4" />
              Add another income
            </ButtonLink>
            <ButtonLink href="/finance/transactions" size="sm" variant="outline">
              View transactions
            </ButtonLink>
            <ButtonLink href="/finance" size="sm" variant="outline">
              View finance
            </ButtonLink>
          </div>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Income details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Date</dt>
              <dd className="mt-1 text-sm text-ink">{formatDate(row.incomeDate)}</dd>
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
              <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">Received via</dt>
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
