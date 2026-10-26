"use client";

import * as React from "react";
import { ReceiptText } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { fetchFinanceDashboard } from "@/lib/finance/client";
import { defaultFinanceRange } from "@/lib/finance/utils";
import type { FinanceDashboard } from "@/lib/finance/types";

function Line({
  label,
  value,
  hint,
  strong,
  negative,
}: {
  label: string;
  value: string;
  hint?: string;
  strong?: boolean;
  negative?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-4 ${strong ? "border-t border-border pt-3" : ""}`}>
      <div>
        <p className={`text-sm ${strong ? "font-semibold text-ink" : "text-neutral-600"}`}>{label}</p>
        {hint && <p className="text-xs text-neutral-500">{hint}</p>}
      </div>
      <p className={`tabular-nums ${negative ? "text-red-700" : "text-ink"} ${strong ? "font-semibold" : ""}`}>
        {value}
      </p>
    </div>
  );
}

export function FinanceReportsScreen() {
  const { organization, branches } = useOrganization();
  const orgId = organization?.id;
  const { formatMoney } = useFinanceSettings();
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

  return (
    <div className="space-y-6">
      <PageHeader
        title="Finance reports"
        description="Cash movement and collections for the selected range. This is not an accounting-grade profit figure."
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
        }}
      />

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !data ? (
        <LoadingState label="Loading report…" />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Money collected</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Line
                label="Invoice payments"
                value={formatMoney(data.paymentsCollected)}
                hint={`${data.paymentCount} payments`}
              />
              <Line
                label="POS sales"
                value={formatMoney(data.posSalesTotal)}
                hint={`${data.posSaleCount} completed sales`}
              />
              <Line
                label="Other income"
                value={formatMoney(data.otherIncomeTotal)}
                hint={`${data.incomeCount} entries`}
              />
              <Line label="Total collected" value={formatMoney(data.collectedTotal)} strong />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Receivables (not cash)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Line
                label="Invoiced total"
                value={formatMoney(data.invoicedTotal)}
                hint={`${data.invoiceCount} issued invoices`}
              />
              <Line
                label="Outstanding balance"
                value={formatMoney(data.outstanding)}
                hint="Unpaid invoice remainder"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Cash out</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Line
                label="Paid expenses"
                value={formatMoney(data.expensesPaid)}
                hint={`${data.expenseCount} expenses · ${formatMoney(data.expensesPending)} pending`}
                negative
              />
              <Line
                label="Processed refunds"
                value={formatMoney(data.refundsProcessed)}
                hint={`${data.refundCount} refunds`}
                negative
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stock purchase costs</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Line
                label="Received purchases"
                value={formatMoney(data.purchaseTotal)}
                hint={`${data.purchaseCount} receipts. Not copied as expenses.`}
              />
              <Line label="Net cash movement" value={formatMoney(data.netCash)} strong />
              <p className="text-xs text-neutral-500">
                Net cash movement = collected − paid expenses − processed refunds. It is not labelled profit
                because cost of goods, accrued expenses and tax are not fully recognized in this schema.
              </p>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
