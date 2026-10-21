"use client";

import * as React from "react";
import Link from "next/link";
import {
  ArrowRight,
  ChartColumn,
  Download,
  Printer,
  Users,
  BadgeCheck,
  CreditCard,
  CalendarCheck,
  Target,
  Package,
  ShoppingCart,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { ReportStat } from "@/components/reports/report-stat";
import { fetchReportsOverview } from "@/lib/reports/client";
import { REPORT_CATEGORY_META, type ReportsOverview } from "@/lib/reports/types";
import { defaultFinanceRange } from "@/lib/finance/utils";
import { downloadCsvTable } from "@/lib/reports/csv";
import type { FinanceDashboard } from "@/lib/finance/types";
import type { CrmPipelineCounts } from "@/lib/crm/client";

const CATEGORY_ICONS = {
  members: Users,
  memberships: BadgeCheck,
  billing: CreditCard,
  attendance: CalendarCheck,
  crm: Target,
  inventory: Package,
  pos: ShoppingCart,
} as const;

export function ReportsOverviewScreen() {
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [branchId, setBranchId] = React.useState("all");
  const [overview, setOverview] = React.useState<ReportsOverview | null>(null);
  const [finance, setFinance] = React.useState<FinanceDashboard | null>(null);
  const [crm, setCrm] = React.useState<CrmPipelineCounts | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const canExport = can("reports.export");
  const canFinance = can("finance.view") || can("billing.view");

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchReportsOverview({
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
    setOverview(result.data.overview);
    setFinance(result.data.finance);
    setCrm(result.data.crm);
  }, [orgId, branchId, from, to]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visibleCategories = REPORT_CATEGORY_META.filter((item) => can(item.permission));

  const exportOverview = () => {
    if (!overview) return;
    downloadCsvTable(
      `reports-overview-${from}-to-${to}`,
      [
        { header: "Metric", value: (row: { metric: string; value: string }) => row.metric },
        { header: "Value", value: (row) => row.value },
      ],
      [
        { metric: "Active members", value: String(overview.activeMembers) },
        { metric: "Members joined in range", value: String(overview.membersJoinedInRange) },
        { metric: "Active memberships", value: String(overview.activeMemberships) },
        { metric: "Expiring memberships (30 days)", value: String(overview.expiringMemberships) },
        { metric: "Open freeze windows", value: String(overview.freezeWindowsOpen) },
        { metric: "Invoiced total", value: String(overview.invoicedTotal) },
        { metric: "Invoice payments", value: String(overview.paymentsCollected) },
        { metric: "POS sales (completed)", value: String(overview.posSalesTotal) },
        { metric: "Other income", value: String(overview.otherIncomeTotal) },
        { metric: "Collected cash", value: String(overview.collectedTotal) },
        { metric: "Outstanding invoice balance", value: String(overview.outstanding) },
        { metric: "Attendance in range", value: String(overview.attendanceInRange) },
        { metric: "New leads", value: String(overview.newLeads) },
        { metric: "Overdue follow-ups", value: String(overview.followUpsOverdue) },
        { metric: "Low stock products", value: String(overview.lowStockCount) },
      ],
    );
  };

  return (
    <div className="space-y-6 print:space-y-3">
      <PageHeader
        title="Reports"
        description="Live counts from members, memberships, billing, attendance, CRM, inventory and POS. Finance cash movement is not duplicated here."
        icon={ChartColumn}
        actions={
          <>
            {canExport && (
              <Button variant="outline" onClick={exportOverview} disabled={!overview}>
                <Download aria-hidden="true" className="size-4" />
                Export CSV
              </Button>
            )}
            <Button variant="outline" onClick={() => window.print()}>
              <Printer aria-hidden="true" className="size-4" />
              Print
            </Button>
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
      ) : loading || !overview ? (
        <LoadingState label="Loading reports…" />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <ReportStat
              label="Active members"
              value={overview.activeMembers.toLocaleString()}
              hint={`${overview.membersJoinedInRange} joined ${formatDate(from)} – ${formatDate(to)}`}
              icon={Users}
            />
            <ReportStat
              label="Active memberships"
              value={overview.activeMemberships.toLocaleString()}
              hint={`${overview.expiringMemberships} ending in 30 days`}
              icon={BadgeCheck}
              tone="primary"
            />
            {canFinance ? (
              <ReportStat
                label="Collected cash"
                value={formatMoney(overview.collectedTotal)}
                hint="Invoice payments + POS + other income"
                icon={CreditCard}
                tone="success"
              />
            ) : (
              <ReportStat
                label="Attendance"
                value={overview.attendanceInRange.toLocaleString()}
                hint="Check-ins in range"
                icon={CalendarCheck}
              />
            )}
            {canFinance ? (
              <ReportStat
                label="Outstanding dues"
                value={formatMoney(overview.outstanding)}
                hint="Unpaid invoice remainder — not cash"
                icon={CreditCard}
                tone="warning"
              />
            ) : (
              <ReportStat
                label="New leads"
                value={overview.newLeads.toLocaleString()}
                hint={`${overview.followUpsOverdue} overdue follow-ups`}
                icon={Target}
              />
            )}
          </section>

          {canFinance && finance && (
            <Card>
              <CardHeader>
                <CardTitle>Collections vs invoiced</CardTitle>
                <Link
                  href="/finance/reports"
                  className="inline-flex items-center gap-1 text-sm font-medium text-primary-700"
                >
                  Open finance reports
                  <ArrowRight aria-hidden="true" className="size-3.5" />
                </Link>
              </CardHeader>
              <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <p className="text-sm text-neutral-600">
                  Invoiced
                  <span className="mt-1 block font-semibold text-ink">{formatMoney(finance.invoicedTotal)}</span>
                </p>
                <p className="text-sm text-neutral-600">
                  Invoice payments
                  <span className="mt-1 block font-semibold text-ink">{formatMoney(finance.paymentsCollected)}</span>
                </p>
                <p className="text-sm text-neutral-600">
                  POS sales
                  <span className="mt-1 block font-semibold text-ink">{formatMoney(finance.posSalesTotal)}</span>
                </p>
                <p className="text-sm text-neutral-600">
                  Other income
                  <span className="mt-1 block font-semibold text-ink">{formatMoney(finance.otherIncomeTotal)}</span>
                </p>
              </CardContent>
              <p className="px-5 pb-4 text-xs text-neutral-500">
                Collected cash is not profit. Purchases are stock cost and are not copied as expenses.
              </p>
            </Card>
          )}

          <section>
            <h2 className="mb-3 text-sm font-semibold text-ink">Report categories</h2>
            {visibleCategories.length === 0 ? (
              <EmptyState
                title="No report categories available"
                description="Your role does not include module view permissions used by reports."
              />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {visibleCategories.map((item) => {
                  const Icon = CATEGORY_ICONS[item.id];
                  return (
                    <Link
                      key={item.id}
                      href={item.href}
                      className="rounded-card border border-border bg-surface p-4 transition-colors hover:border-primary-200 hover:bg-primary-50/40"
                    >
                      <div className="flex items-start gap-3">
                        <span className="flex size-9 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                          <Icon aria-hidden="true" className="size-4" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-ink">{item.title}</p>
                          <p className="mt-0.5 text-sm text-neutral-500">{item.description}</p>
                        </div>
                        <ArrowRight aria-hidden="true" className="mt-1 size-4 text-neutral-400" />
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </section>

          {crm && can("crm.view") && (
            <p className="text-xs text-neutral-400">
              Pipeline snapshot: {crm.newLeads} new, {crm.contacted} contacted, {crm.qualified} qualified,{" "}
              {crm.converted} converted, {crm.followUpsOverdue} overdue follow-ups.
            </p>
          )}
        </>
      )}
    </div>
  );
}
