"use client";

import * as React from "react";
import { FlaskConical, PhoneCall, Share2, Target } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fetchCrmPipelineCounts, type CrmPipelineCounts } from "@/lib/crm/client";

const emptyCounts: CrmPipelineCounts = {
  newLeads: 0,
  contacted: 0,
  qualified: 0,
  trial: 0,
  converted: 0,
  lost: 0,
  followUpsToday: 0,
  followUpsOverdue: 0,
  trialsActive: 0,
  referralsPending: 0,
};

export function CrmDashboard() {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can(PERMISSIONS.crm.manage);
  const [counts, setCounts] = React.useState<CrmPipelineCounts | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void fetchCrmPipelineCounts(orgId).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setError(result.error.message);
        return;
      }
      setCounts(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const data = counts ?? emptyCounts;

  return (
    <div className="space-y-6">
      <PageHeader
        title="CRM"
        description="Lead to member in one path: follow up, trial, convert, then membership and billing."
        icon={Target}
        actions={
          canManage ? (
            <ButtonLink href="/crm/leads/add">Add lead</ButtonLink>
          ) : undefined
        }
      />

      {error ? (
        <ErrorState description={error} />
      ) : loading ? (
        <LoadingState label="Loading pipeline…" />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
            <PipelineStat label="New" value={data.newLeads} href="/crm/leads?status=new" />
            <PipelineStat label="Contacted" value={data.contacted} href="/crm/leads" />
            <PipelineStat label="Qualified" value={data.qualified} href="/crm/leads" />
            <PipelineStat label="Trial" value={data.trial} href="/crm/trials" />
            <PipelineStat label="Converted" value={data.converted} href="/crm/leads" />
            <PipelineStat label="Lost" value={data.lost} href="/crm/leads" />
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <ShortcutCard
              title="Follow-ups today"
              value={data.followUpsToday}
              hint={data.followUpsOverdue > 0 ? `${data.followUpsOverdue} overdue` : "None overdue"}
              href="/crm/follow-ups"
              icon={PhoneCall}
            />
            <ShortcutCard
              title="Active trials"
              value={data.trialsActive}
              hint="Convert a successful trial to a member"
              href="/crm/trials"
              icon={FlaskConical}
            />
            <ShortcutCard
              title="Pending referrals"
              value={data.referralsPending}
              hint="Track who referred a prospect"
              href="/crm/referrals"
              icon={Share2}
            />
          </div>
        </>
      )}
    </div>
  );
}

function PipelineStat({ label, value, href }: { label: string; value: number; href: string }) {
  return (
    <ButtonLink href={href} variant="outline" className="h-auto flex-col items-start gap-1 px-4 py-3">
      <span className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</span>
      <span className="text-xl font-semibold text-ink">{value}</span>
    </ButtonLink>
  );
}

function ShortcutCard({
  title,
  value,
  hint,
  href,
  icon: Icon,
}: {
  title: string;
  value: number;
  hint: string;
  href: string;
  icon: typeof PhoneCall;
}) {
  return (
    <Card className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-ink">{title}</p>
          <p className="mt-0.5 text-sm text-neutral-500">{hint}</p>
        </div>
        <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
          <Icon aria-hidden="true" className="size-5" />
        </span>
      </div>
      <p className="text-2xl font-semibold text-ink">{value}</p>
      <ButtonLink href={href} variant="outline" size="sm">
        Open
      </ButtonLink>
    </Card>
  );
}
