"use client";

import * as React from "react";
import { Download, Printer } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/badge";
import { useOrganization } from "@/components/auth/org-provider";
import { FinanceScopeFilters } from "@/components/finance/finance-scope-filters";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import { ReportStat } from "@/components/reports/report-stat";
import { defaultFinanceRange } from "@/lib/finance/utils";
import { downloadCsvTable } from "@/lib/reports/csv";
import {
  fetchAttendanceReportRows,
  fetchMemberReportRows,
  fetchMembershipReportRows,
  fetchOpenFreezeCount,
  fetchPosReportRows,
  fetchStockReportRows,
} from "@/lib/reports/client";
import { fetchFinanceDashboard } from "@/lib/finance/client";
import { fetchCrmPipelineCounts } from "@/lib/crm/client";
import { expiringMemberships, membersJoinedInRange } from "@/lib/reports/compute";
import { REPORT_CATEGORY_META, type ReportCategory } from "@/lib/reports/types";
import { PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { GYM_MEMBER_STATUS_LABELS } from "@/lib/auth/permissions";

const MEMBERSHIP_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  active: "Active",
  expired: "Expired",
  cancelled: "Cancelled",
};

export function CategoryReportScreen({ category }: { category: ReportCategory }) {
  const meta = REPORT_CATEGORY_META.find((item) => item.id === category)!;
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const { formatMoney, formatDate } = useFinanceSettings();
  const defaults = React.useMemo(() => defaultFinanceRange(), []);
  const [from, setFrom] = React.useState(defaults.from);
  const [to, setTo] = React.useState(defaults.to);
  const [branchId, setBranchId] = React.useState("all");
  const [rows, setRows] = React.useState<Record<string, string | number | boolean | null>[]>([]);
  const [stats, setStats] = React.useState<{ label: string; value: string; hint?: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const canExport = can("reports.export");
  const canView = can(meta.permission);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const scope = {
      organizationId: orgId,
      branchId: branchId === "all" ? undefined : branchId,
      from: from || undefined,
      to: to || undefined,
    };

    try {
      if (category === "members") {
        const result = await fetchMemberReportRows(scope);
        if (result.error) throw new Error(result.error.message);
        const joined = membersJoinedInRange(result.data, from, to);
        setStats([
          { label: "All members", value: String(result.data.length) },
          { label: "Active", value: String(result.data.filter((row) => row.status === "active").length) },
          { label: "Joined in range", value: String(joined.length), hint: `${formatDate(from)} – ${formatDate(to)}` },
          { label: "Inactive", value: String(result.data.filter((row) => row.status === "inactive").length) },
        ]);
        setRows(
          result.data.map((row) => ({
            id: row.id,
            code: row.code,
            fullName: row.fullName,
            status: GYM_MEMBER_STATUS_LABELS[row.status] ?? row.status,
            branchName: row.branchName,
            joinedAt: formatDate(row.joinedAt),
            phone: row.phone,
          })),
        );
      } else if (category === "memberships") {
        const [result, freezes] = await Promise.all([
          fetchMembershipReportRows(scope),
          fetchOpenFreezeCount(scope),
        ]);
        if (result.error) throw new Error(result.error.message);
        if (freezes.error) throw new Error(freezes.error.message);
        const expiring = expiringMemberships(result.data);
        setStats([
          { label: "Active", value: String(result.data.filter((row) => row.status === "active").length) },
          { label: "Expiring (30 days)", value: String(expiring.length) },
          { label: "Expired", value: String(result.data.filter((row) => row.status === "expired").length) },
          {
            label: "Open freeze windows",
            value: String(freezes.data),
            hint: "Freeze is a timeline event, not a member status",
          },
        ]);
        setRows(
          result.data.map((row) => ({
            id: row.id,
            memberName: row.memberName,
            planName: row.planName,
            status: MEMBERSHIP_STATUS_LABELS[row.status] ?? row.status,
            branchName: row.branchName,
            startDate: formatDate(row.startDate),
            endDate: formatDate(row.endDate),
            freezeDaysUsed: row.freezeDaysUsed,
          })),
        );
      } else if (category === "billing") {
        const result = await fetchFinanceDashboard(scope);
        if (result.error) throw new Error(result.error.message);
        const data = result.data;
        setStats([
          { label: "Invoiced total", value: formatMoney(data.invoicedTotal), hint: `${data.invoiceCount} issued invoices` },
          { label: "Invoice payments", value: formatMoney(data.paymentsCollected), hint: `${data.paymentCount} payments` },
          { label: "Outstanding", value: formatMoney(data.outstanding), hint: "Receivable, not cash collected" },
          { label: "POS sales", value: formatMoney(data.posSalesTotal), hint: "Completed sales only — not mixed into invoice payments" },
        ]);
        setRows([
          { id: "invoiced", metric: "Invoiced total", value: formatMoney(data.invoicedTotal), note: "Issued / paid / partial / overdue invoice totals" },
          { id: "payments", metric: "Invoice payments", value: formatMoney(data.paymentsCollected), note: "Persisted payment rows" },
          { id: "pos", metric: "POS sales", value: formatMoney(data.posSalesTotal), note: "Completed POS only" },
          { id: "income", metric: "Other income", value: formatMoney(data.otherIncomeTotal), note: "Manual receipts, not invoices" },
          { id: "collected", metric: "Collected cash", value: formatMoney(data.collectedTotal), note: "Payments + POS + other income" },
          { id: "outstanding", metric: "Outstanding", value: formatMoney(data.outstanding), note: "Invoice remainder" },
          { id: "expenses", metric: "Paid expenses", value: formatMoney(data.expensesPaid), note: "Paid expenses only" },
          { id: "purchases", metric: "Purchase costs (received)", value: formatMoney(data.purchaseTotal), note: "Stock cost, never copied as expenses" },
        ]);
      } else if (category === "attendance") {
        const result = await fetchAttendanceReportRows(scope);
        if (result.error) throw new Error(result.error.message);
        setStats([
          { label: "Check-ins", value: String(result.data.length), hint: `${formatDate(from)} – ${formatDate(to)}` },
        ]);
        setRows(
          result.data.map((row) => ({
            id: row.id,
            memberName: row.memberName,
            branchName: row.branchName,
            checkInAt: formatDate(row.checkInAt),
            checkOutAt: row.checkOutAt ? formatDate(row.checkOutAt) : "—",
            method: row.method,
          })),
        );
      } else if (category === "crm") {
        const result = await fetchCrmPipelineCounts(orgId);
        if (result.error) throw new Error(result.error.message);
        const data = result.data;
        setStats([
          { label: "New leads", value: String(data.newLeads) },
          { label: "Follow-ups overdue", value: String(data.followUpsOverdue) },
          { label: "Trials active", value: String(data.trialsActive) },
          { label: "Referrals pending", value: String(data.referralsPending) },
        ]);
        setRows([
          { id: "new", metric: "New", value: data.newLeads },
          { id: "contacted", metric: "Contacted", value: data.contacted },
          { id: "qualified", metric: "Qualified", value: data.qualified },
          { id: "trial", metric: "Trial", value: data.trial },
          { id: "converted", metric: "Converted", value: data.converted },
          { id: "lost", metric: "Lost", value: data.lost },
          { id: "follow-today", metric: "Follow-ups today", value: data.followUpsToday },
          { id: "follow-overdue", metric: "Follow-ups overdue", value: data.followUpsOverdue },
          { id: "trials-upcoming", metric: "Trials upcoming", value: data.trialsUpcoming },
          { id: "trials-active", metric: "Trials active", value: data.trialsActive },
          { id: "referrals", metric: "Referrals pending", value: data.referralsPending },
        ]);
      } else if (category === "inventory") {
        const result = await fetchStockReportRows(orgId);
        if (result.error) throw new Error(result.error.message);
        const low = result.data.filter((row) => row.isLow);
        setStats([
          { label: "Tracked products", value: String(result.data.length) },
          { label: "Low stock", value: String(low.length) },
          {
            label: "Stock value",
            value: formatMoney(result.data.reduce((sum, row) => sum + row.stockValue, 0)),
            hint: "Quantity × cost price",
          },
        ]);
        setRows(
          result.data.map((row) => ({
            id: row.productId,
            name: row.name,
            sku: row.sku ?? "—",
            stockQuantity: row.stockQuantity,
            reorderLevel: row.reorderLevel,
            stockValue: formatMoney(row.stockValue),
            isLow: row.isLow ? "Low" : "OK",
          })),
        );
      } else {
        const result = await fetchPosReportRows(scope);
        if (result.error) throw new Error(result.error.message);
        const total = result.data.reduce((sum, row) => sum + row.total, 0);
        setStats([
          { label: "Completed sales", value: String(result.data.length) },
          { label: "POS total", value: formatMoney(total), hint: "Not mixed into invoice payments" },
        ]);
        setRows(
          result.data.map((row) => ({
            id: row.id,
            saleNumber: row.saleNumber,
            branchName: row.branchName,
            total: formatMoney(row.total),
            paymentMethod: PAYMENT_METHOD_LABELS[row.paymentMethod] ?? row.paymentMethod,
            soldAt: formatDate(row.soldAt),
          })),
        );
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load this report.");
      setLoading(false);
      return;
    }
    setLoading(false);
  }, [orgId, canView, category, branchId, from, to, formatDate, formatMoney]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const columns: Column<Record<string, string | number | boolean | null>>[] =
    rows[0]
      ? Object.keys(rows[0])
          .filter((key) => key !== "id")
          .map((key) => ({
            id: key,
            header: key.replace(/([A-Z])/g, " $1").replace(/^./, (char) => char.toUpperCase()),
            cell: (row) =>
              key === "status" || key === "isLow" ? (
                <StatusBadge status={String(row[key] ?? "")} />
              ) : (
                <span className="whitespace-nowrap">{row[key] == null ? "—" : String(row[key])}</span>
              ),
          }))
      : [];

  const exportRows = () => {
    if (!rows[0]) return;
    const keys = Object.keys(rows[0]).filter((key) => key !== "id");
    downloadCsvTable(
      `report-${category}-${from}-to-${to}`,
      keys.map((key) => ({
        header: key,
        value: (row: Record<string, string | number | boolean | null>) =>
          row[key] == null ? "" : String(row[key]),
      })),
      rows,
    );
  };

  if (!canView) {
    return (
      <EmptyState
        title="This report is restricted"
        description="Your role does not include permission to view this module."
      />
    );
  }

  return (
    <div className="space-y-6 print:space-y-3">
      <PageHeader
        title={meta.title}
        description={meta.description}
        actions={
          <>
            <ButtonLink href="/reports" variant="outline">
              All reports
            </ButtonLink>
            <ButtonLink href={meta.moduleHref} variant="outline">
              Open module
            </ButtonLink>
            {canExport && (
              <Button variant="outline" onClick={exportRows} disabled={rows.length === 0}>
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

      {category !== "inventory" && category !== "crm" && (
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
      )}

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState label="Loading report…" />
      ) : (
        <>
          <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {stats.map((stat) => (
              <ReportStat key={stat.label} label={stat.label} value={stat.value} hint={stat.hint} />
            ))}
          </section>
          <Card noPadding>
            <DataTable
              columns={columns}
              data={rows}
              rowKey={(row) => String(row.id)}
              emptyTitle="No rows in this range"
              emptyDescription="Try a different date range or branch."
            />
          </Card>
        </>
      )}
    </div>
  );
}
