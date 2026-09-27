"use client";

import * as React from "react";
import { CreditCard } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchInvoices } from "@/lib/billing/client";
import { formatCurrency, formatDate } from "@/lib/format";
import type { InvoiceRow } from "@/lib/billing/types";
import type { MembershipRow } from "@/lib/operations/adapters";

function humanLabel(value: string) {
  return value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MembershipRelatedBilling({ row }: { row: MembershipRow }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canView = can("billing.view");
  const canCreate = can("billing.create");

  const [rows, setRows] = React.useState<InvoiceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchInvoices({
      organizationId: orgId,
      membershipId: row.id,
      pageSize: 8,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
  }, [orgId, row.id, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) return null;

  const invoiceHref = `/billing/new-invoice?memberId=${row.memberId}&membershipId=${row.id}`;

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Related billing</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Invoices linked to this membership. Payment stays in Billing.
          </p>
        </div>
        {canCreate && (
          <ButtonLink href={invoiceHref} size="sm" variant="outline">
            Create invoice
          </ButtonLink>
        )}
      </div>
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState label="Loading invoices…" />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={CreditCard}
          title="No invoices yet"
          description="Create an invoice in Billing when you are ready to charge."
          action={canCreate ? { label: "Create invoice", href: invoiceHref } : undefined}
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((invoice) => (
            <li
              key={invoice.id}
              className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">{invoice.invoiceNumber}</p>
                <p className="text-xs text-neutral-500">{formatDate(invoice.issueDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(invoice.status)} />
                <span className="text-sm tabular-nums text-ink">
                  {formatCurrency(invoice.total, currency)}
                </span>
                <ButtonLink href={`/billing/invoices/${invoice.id}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </li>
          ))}
        </ol>
      )}
    </Card>
  );
}
