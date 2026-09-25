"use client";

import * as React from "react";
import { Banknote, CalendarClock, FilePlus, FileText, Percent, TriangleAlert, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { LineChart, BarChart } from "@/components/ui/chart";
import { ChartCard } from "@/components/dashboard/chart-card";
import { KpiCard } from "@/components/dashboard/kpi-card";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchBillingDashboard } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import { PAYMENT_METHOD_LABELS, INVOICE_STATUS_LABELS } from "@/lib/billing/types";
import { humanStatus } from "@/components/billing/status-copy";
import type { BillingDashboard } from "@/lib/billing/types";

export function BillingDashboardScreen() {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const [data, setData] = React.useState<BillingDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchBillingDashboard(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setData(result.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Billing"
        description="Revenue, outstanding and collections for this organization."
        icon={Wallet}
        actions={
          <>
            {can("billing.create") && (
              <ButtonLink href="/billing/new-invoice">
                <FilePlus aria-hidden="true" className="size-4" />
                New Invoice
              </ButtonLink>
            )}
            {can("payments.create") && (
              <ButtonLink href="/billing/payments" variant="outline">
                Record Payment
              </ButtonLink>
            )}
            <ButtonLink href="/billing/outstanding" variant="outline">
              Outstanding
            </ButtonLink>
            {can("gst.view") && (
              <ButtonLink href="/billing/gst-master" variant="outline">
                GST Master
              </ButtonLink>
            )}
          </>
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !data ? (
        <LoadingState label="Loading billing…" />
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <KpiCard
              icon={Banknote}
              metric={{ id: "today-revenue", label: "Today's revenue", value: formatCurrency(data.todayRevenue, currency) }}
            />
            <KpiCard
              icon={Wallet}
              metric={{ id: "monthly-revenue", label: "Monthly revenue", value: formatCurrency(data.monthlyRevenue, currency) }}
            />
            <KpiCard
              icon={TriangleAlert}
              tone="warning"
              metric={{ id: "outstanding", label: "Outstanding", value: formatCurrency(data.outstanding, currency) }}
            />
            <KpiCard
              icon={CalendarClock}
              tone="accent"
              metric={{ id: "overdue", label: "Overdue", value: formatCurrency(data.overdue, currency) }}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Card>
              <p className="text-sm text-neutral-500">Paid invoices</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.paidCount}</p>
            </Card>
            <Card>
              <p className="text-sm text-neutral-500">Partial / unpaid</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.unpaidCount}</p>
            </Card>
            <Card>
              <p className="text-sm text-neutral-500">Installments due</p>
              <p className="mt-2 text-2xl font-semibold text-ink">{data.installmentsDue}</p>
            </Card>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ChartCard title="Revenue trend" description="Last 30 days">
              {data.revenueTrend.every((point) => point.value === 0) ? (
                <EmptyState title="No payments yet" description="Record a payment to see the trend." />
              ) : (
                <LineChart
                  labels={data.revenueTrend.map((point) => point.label)}
                  data={data.revenueTrend.map((point) => point.value)}
                  area
                  formatValue={(value) => formatCurrency(value, currency)}
                />
              )}
            </ChartCard>
            <ChartCard title="Payment methods" description="This month">
              {data.methodSummary.length === 0 ? (
                <EmptyState title="No collections this month" description="Payments will group by method here." />
              ) : (
                <BarChart
                  labels={data.methodSummary.map((item) => PAYMENT_METHOD_LABELS[item.method] ?? item.method)}
                  data={data.methodSummary.map((item) => item.amount)}
                  formatValue={(value) => formatCurrency(value, currency)}
                />
              )}
            </ChartCard>
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="space-y-3 lg:col-span-1">
              <h2 className="text-sm font-semibold text-ink">Recent invoices</h2>
              {data.recentInvoices.length === 0 ? (
                <EmptyState icon={FileText} title="No invoices" description="Create an invoice to get started." />
              ) : (
                <ul className="space-y-3">
                  {data.recentInvoices.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <a href={`/billing/invoices/${row.id}`} className="font-medium text-ink hover:underline">
                          {row.invoiceNumber}
                        </a>
                        <p className="text-xs text-neutral-500">{row.memberName}</p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums">{formatCurrency(row.total, currency)}</p>
                        <StatusBadge status={INVOICE_STATUS_LABELS[row.status] ?? humanStatus(row.status)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">Recent payments</h2>
              {data.recentPayments.length === 0 ? (
                <EmptyState title="No payments" description="Record a payment against an invoice." />
              ) : (
                <ul className="space-y-3">
                  {data.recentPayments.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-ink">{row.memberName}</p>
                        <p className="text-xs text-neutral-500">
                          {PAYMENT_METHOD_LABELS[row.method] ?? row.method} · {formatDate(row.paidAt)}
                        </p>
                      </div>
                      <p className="tabular-nums">{formatCurrency(row.amount, currency)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
            <Card className="space-y-3">
              <h2 className="text-sm font-semibold text-ink">Upcoming dues</h2>
              {data.upcomingDues.length === 0 ? (
                <EmptyState icon={Percent} title="No upcoming dues" description="Installment schedules will appear here." />
              ) : (
                <ul className="space-y-3">
                  {data.upcomingDues.map((row) => (
                    <li key={row.id} className="flex items-center justify-between gap-3 text-sm">
                      <div>
                        <p className="font-medium text-ink">{row.memberName}</p>
                        <p className="text-xs text-neutral-500">
                          {row.invoiceNumber} · {formatDate(row.dueDate)}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="tabular-nums">{formatCurrency(row.remaining, currency)}</p>
                        <StatusBadge status={humanStatus(row.status)} />
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
