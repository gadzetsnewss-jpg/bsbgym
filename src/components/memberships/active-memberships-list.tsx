"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  CalendarCheck,
  CalendarClock,
  CreditCard,
  FilePlus,
  FileText,
  Hourglass,
  RefreshCcw,
  Snowflake,
  User,
  Users,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate } from "@/lib/format";
import {
  fetchActiveMemberships,
  extendMembership,
  cancelMembership,
  type ActiveMembershipRow,
  type ActiveMembershipsSummary,
} from "@/lib/org/memberships";
import { fetchMembershipPlansForInvoice } from "@/lib/billing/client";
import { RecordPaymentForm } from "@/components/billing/record-payment-form";

const STATUS_FILTER_OPTIONS = [
  { value: "all", label: "Active & Partial Paid (Default)" },
  { value: "paid", label: "Paid" },
  { value: "partial_paid", label: "Partial Paid" },
  { value: "expiring", label: "Expiring" },
  { value: "expired", label: "Expired" },
  { value: "all_records", label: "All Records" },
  { value: "pending", label: "Pending Payment" },
  { value: "frozen", label: "Frozen" },
  { value: "cancelled", label: "Cancelled" },
];

const VALIDITY_FILTER_OPTIONS = [
  { value: "all", label: "All validities" },
  { value: "current", label: "Currently Valid" },
  { value: "expiring_7", label: "Expiring in 7 days" },
  { value: "expiring_30", label: "Expiring in 30 days" },
  { value: "expired", label: "Expired" },
];

function membershipStatusLabel(status: ActiveMembershipRow["membershipStatus"]) {
  switch (status) {
    case "active":
      return "Active";
    case "pending":
      return "Pending Payment";
    case "expired":
      return "Expired";
    case "frozen":
      return "Frozen";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

function paymentStatusLabel(status: ActiveMembershipRow["paymentStatus"]) {
  switch (status) {
    case "paid":
      return "Paid";
    case "partially_paid":
      return "Partially Paid";
    case "unpaid":
      return "Pending Payment";
    case "cancelled":
      return "Cancelled";
    case "manual":
      return "Paid (Historical)";
    default:
      return status;
  }
}

export function ActiveMembershipsList() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const [rows, setRows] = React.useState<ActiveMembershipRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [summary, setSummary] = React.useState<ActiveMembershipsSummary>({
    totalCount: 0,
    activeCount: 0,
    partialPaidCount: 0,
    expiringCount: 0,
    pendingCount: 0,
    totalOutstandingBalance: 0,
  });
  const [page, setPage] = React.useState(1);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [branchId, setBranchId] = React.useState("all");
  const [planId, setPlanId] = React.useState("all");
  const [validity, setValidity] = React.useState("all");
  const [plans, setPlans] = React.useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Modals state
  const [payRow, setPayRow] = React.useState<ActiveMembershipRow | null>(null);
  const [extendRow, setExtendRow] = React.useState<ActiveMembershipRow | null>(null);
  const [extendDays, setExtendDays] = React.useState("7");
  const [extendSaving, setExtendSaving] = React.useState(false);
  const [cancelRow, setCancelRow] = React.useState<ActiveMembershipRow | null>(null);
  const [cancelSaving, setCancelSaving] = React.useState(false);

  React.useEffect(() => {
    if (!orgId) return;
    void fetchMembershipPlansForInvoice(orgId).then((result) => {
      if (result.data) {
        setPlans(result.data.map((p) => ({ id: p.id, name: p.name })));
      }
    });
  }, [orgId]);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchActiveMemberships({
      organizationId: orgId,
      search,
      status,
      branchId,
      planId,
      validity,
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
    setSummary(result.data.summary);
  }, [orgId, search, status, branchId, planId, validity, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submitExtend = async () => {
    if (!extendRow) return;
    const days = Number(extendDays);
    if (!Number.isInteger(days) || days <= 0) {
      toast({ title: "Enter a valid positive number of days", variant: "error" });
      return;
    }
    setExtendSaving(true);
    const result = await extendMembership(extendRow.id, days);
    setExtendSaving(false);
    if (result.error) {
      toast({ title: "Could not extend membership", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: `Extended membership by ${days} days`, variant: "success" });
    setExtendRow(null);
    void load();
  };

  const submitCancel = async () => {
    if (!cancelRow) return;
    setCancelSaving(true);
    const result = await cancelMembership(cancelRow.id);
    setCancelSaving(false);
    if (result.error) {
      toast({ title: "Could not cancel membership", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Membership cancelled", variant: "success" });
    setCancelRow(null);
    void load();
  };

  const activeFilterCount =
    (status !== "all" ? 1 : 0) +
    (branchId !== "all" ? 1 : 0) +
    (planId !== "all" ? 1 : 0) +
    (validity !== "all" ? 1 : 0) +
    (search ? 1 : 0);

  const clearFilters = () => {
    setStatus("all");
    setBranchId("all");
    setPlanId("all");
    setValidity("all");
    setSearch("");
    setPage(1);
  };

  const columns: Column<ActiveMembershipRow>[] = [
    {
      id: "member",
      header: "Member",
      cell: (row) => (
        <div>
          <Link
            href={`/members/${row.memberId}`}
            className="font-medium text-ink hover:text-primary-700 hover:underline"
          >
            {row.memberName}
          </Link>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-neutral-500">
            {row.memberCode && <span>{row.memberCode}</span>}
            {row.memberPhone && (
              <>
                <span>•</span>
                <span>{row.memberPhone}</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "plan",
      header: "Plan",
      cell: (row) => (
        <span className="font-medium text-ink">{row.planName}</span>
      ),
    },
    {
      id: "branch",
      header: "Branch",
      cell: (row) => (
        <span className="text-xs text-neutral-600">{row.branchName}</span>
      ),
    },
    {
      id: "dates",
      header: "Dates",
      cell: (row) => (
        <div className="text-xs">
          <p className="text-ink">{formatDate(row.startDate)} – {formatDate(row.endDate)}</p>
          {row.isFrozenCurrently && (
            <Badge tone="info" className="mt-0.5 text-[10px]">
              Currently Frozen
            </Badge>
          )}
        </div>
      ),
    },
    {
      id: "invoice",
      header: "Invoice #",
      cell: (row) =>
        row.invoiceId ? (
          <Link
            href={`/billing/invoices/${row.invoiceId}`}
            className="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline"
          >
            <FileText className="size-3.5" />
            <span>{row.invoiceNumber || "View Invoice"}</span>
          </Link>
        ) : (
          <span className="text-xs text-neutral-400">Manual / Historical</span>
        ),
    },
    {
      id: "amount",
      header: "Total",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums font-medium text-ink">
          {formatCurrency(row.totalPlanAmount, currency)}
        </span>
      ),
    },
    {
      id: "paid",
      header: "Amount Paid",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-ink">
          {formatCurrency(row.totalAmountPaid, currency)}
        </span>
      ),
    },
    {
      id: "credited",
      header: "Applied Credit",
      align: "right",
      cell: (row) => (
        <span className="tabular-nums text-xs text-neutral-500">
          {formatCurrency(row.amountCredited, currency)}
        </span>
      ),
    },
    {
      id: "balance",
      header: "Outstanding Balance",
      align: "right",
      cell: (row) =>
        row.remainingBalance > 0 ? (
          <span className="tabular-nums font-semibold text-amber-700">
            {formatCurrency(row.remainingBalance, currency)}
          </span>
        ) : (
          <span className="tabular-nums text-xs font-medium text-emerald-700">
            ₹0
          </span>
        ),
    },
    {
      id: "membershipStatus",
      header: "Membership Status",
      cell: (row) => (
        <StatusBadge status={membershipStatusLabel(row.membershipStatus)} />
      ),
    },
    {
      id: "paymentStatus",
      header: "Payment Status",
      cell: (row) => (
        <StatusBadge status={paymentStatusLabel(row.paymentStatus)} />
      ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => {
        const canManageBilling = can("billing.create") || can("payments.create");
        const canExtend = can("memberships.extend") && row.membershipStatus === "active";
        const canFreeze = can("memberships.freeze") && row.membershipStatus === "active";
        const canRenew = can("memberships.create");
        const canCancel =
          can("memberships.update") &&
          (row.membershipStatus === "active" || row.membershipStatus === "pending");

        return (
          <RowActions
            items={[
              {
                label: "View membership details",
                href: `/memberships/active/${row.id}`,
              },
              {
                label: "View member profile",
                href: `/members/${row.memberId}`,
              },
              ...(row.invoiceId
                ? [
                    {
                      label: "View linked invoice",
                      href: `/billing/invoices/${row.invoiceId}`,
                    },
                  ]
                : []),
              ...(row.remainingBalance > 0 && canManageBilling && row.invoiceId
                ? [
                    {
                      label: "Collect remaining payment",
                      onClick: () => setPayRow(row),
                    },
                  ]
                : []),
              ...(canExtend
                ? [
                    {
                      label: "Extend membership",
                      onClick: () => {
                        setExtendRow(row);
                        setExtendDays("7");
                      },
                    },
                  ]
                : []),
              ...(canFreeze
                ? [
                    {
                      label: "Freeze membership",
                      href: `/memberships/freeze-extend/add?membershipId=${row.id}`,
                    },
                  ]
                : []),
              ...(canRenew
                ? [
                    {
                      label: "Renew via invoice",
                      href: `/billing/new-invoice?memberId=${row.memberId}&membershipId=${row.id}&presetPlanId=${row.planId}`,
                    },
                  ]
                : []),
              ...(canCancel
                ? [
                    {
                      label: "Cancel membership",
                      variant: "danger" as const,
                      onClick: () => setCancelRow(row),
                    },
                  ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Active memberships"
        description="Unified management for paid and partially paid memberships, track validity, and collect payments."
        icon={BadgeCheck}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/billing/new-invoice" className="bg-[#0E8F8B] hover:bg-[#063C3B]">
              <FilePlus aria-hidden="true" className="size-4" />
              Create invoice
            </ButtonLink>
            <ButtonLink href="/memberships/active/add" variant="outline" size="sm">
              Complimentary / Trial
            </ButtonLink>
          </div>
        }
      />

      {/* Summary Stat Cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="flex items-center gap-3.5 border-emerald-100 bg-emerald-50/40 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-emerald-100 text-emerald-800">
            <BadgeCheck className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-emerald-900">Active Memberships</p>
            <p className="text-2xl font-bold tabular-nums text-emerald-950">
              {summary.activeCount}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 border-amber-100 bg-amber-50/40 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-amber-100 text-amber-800">
            <Wallet className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-amber-900">Partial Paid / Balance Due</p>
            <div className="flex items-baseline gap-2">
              <p className="text-2xl font-bold tabular-nums text-amber-950">
                {summary.partialPaidCount}
              </p>
              {summary.totalOutstandingBalance > 0 && (
                <span className="text-xs font-semibold text-amber-800">
                  ({formatCurrency(summary.totalOutstandingBalance, currency)} due)
                </span>
              )}
            </div>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 border-sky-100 bg-sky-50/40 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-sky-100 text-sky-800">
            <Hourglass className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-sky-900">Expiring in 30 Days</p>
            <p className="text-2xl font-bold tabular-nums text-sky-950">
              {summary.expiringCount}
            </p>
          </div>
        </Card>

        <Card className="flex items-center gap-3.5 border-neutral-200 bg-neutral-50 p-4">
          <div className="flex size-10 items-center justify-center rounded-xl bg-neutral-200 text-neutral-800">
            <CalendarClock className="size-5" />
          </div>
          <div>
            <p className="text-xs font-medium text-neutral-700">Pending Payment</p>
            <p className="text-2xl font-bold tabular-nums text-neutral-900">
              {summary.pendingCount}
            </p>
          </div>
        </Card>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onValueChange={(val) => {
            setSearch(val);
            setPage(1);
          }}
          placeholder="Search by member name, code, phone, or invoice…"
          className="w-full sm:w-80"
        />

        <FilterBar className="flex-1" activeCount={activeFilterCount} onClear={clearFilters}>
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            options={STATUS_FILTER_OPTIONS}
            className="w-48"
          />

          <Select
            value={branchId}
            onChange={(e) => {
              setBranchId(e.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((b) => ({ value: b.id, label: b.name })),
            ]}
            className="w-44"
          />

          <Select
            value={planId}
            onChange={(e) => {
              setPlanId(e.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All plans" },
              ...plans.map((p) => ({ value: p.id, label: p.name })),
            ]}
            className="w-44"
          />

          <Select
            value={validity}
            onChange={(e) => {
              setValidity(e.target.value);
              setPage(1);
            }}
            options={VALIDITY_FILTER_OPTIONS}
            className="w-44"
          />
        </FilterBar>
      </div>

      {/* Table & Pagination */}
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : rows.length === 0 && !loading ? (
        <EmptyState
          icon={BadgeCheck}
          title="No memberships found"
          description={
            activeFilterCount > 0
              ? "No memberships matched your current filters. Try resetting the filters or search."
              : "Sell a membership through New Invoice to start tracking it here."
          }
          action={{
            label: "Create invoice",
            href: "/billing/new-invoice",
          }}
        />
      ) : (
        <DataTable<ActiveMembershipRow>
          data={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
          page={page}
          pageSize={20}
          total={total}
          onPageChange={setPage}
        />
      )}

      {/* Record Payment Modal */}
      {payRow && payRow.invoiceId && (
        <Modal
          open={Boolean(payRow)}
          onClose={() => setPayRow(null)}
          title="Collect remaining payment"
          description={`Record payment for ${payRow.memberName} on invoice ${payRow.invoiceNumber || ""}.`}
        >
          <RecordPaymentForm
            invoiceId={payRow.invoiceId}
            memberLabel={payRow.memberName}
            balance={payRow.remainingBalance}
            onDone={() => {
              setPayRow(null);
              void load();
            }}
          />
        </Modal>
      )}

      {/* Extend Membership Modal */}
      {extendRow && (
        <Modal
          open={Boolean(extendRow)}
          onClose={() => setExtendRow(null)}
          title="Extend membership"
          description={`Add days to ${extendRow.memberName}'s membership without changing the plan.`}
          footer={
            <>
              <Button variant="outline" onClick={() => setExtendRow(null)} disabled={extendSaving}>
                Cancel
              </Button>
              <Button onClick={() => void submitExtend()} isLoading={extendSaving}>
                Extend
              </Button>
            </>
          }
        >
          <div className="space-y-4">
            <FormField label="Days to add" required>
              <Input
                type="number"
                min={1}
                step={1}
                value={extendDays}
                onChange={(e) => setExtendDays(e.target.value)}
              />
            </FormField>
            <p className="text-xs text-neutral-500">
              Current end date: <span className="font-medium text-ink">{formatDate(extendRow.endDate)}</span>.
            </p>
          </div>
        </Modal>
      )}

      {/* Cancel Membership Dialog */}
      {cancelRow && (
        <ConfirmDialog
          open={Boolean(cancelRow)}
          onClose={() => setCancelRow(null)}
          onConfirm={() => void submitCancel()}
          title="Cancel membership"
          description={`Are you sure you want to cancel ${cancelRow.memberName}'s membership for ${cancelRow.planName}? This action updates the membership status to Cancelled.`}
          confirmLabel="Cancel membership"
          tone="danger"
        />
      )}
    </div>
  );
}
