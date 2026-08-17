import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { ChartCard } from "@/components/dashboard/chart-card";
import { DonutChart, type DonutSegment } from "@/components/ui/chart";
import { MEMBERSHIP_OVERVIEW } from "@/data/mock-dashboard";

const SEGMENTS: DonutSegment[] = [
  {
    name: "Active",
    value: MEMBERSHIP_OVERVIEW.active,
    color: "var(--color-primary-500)",
  },
  {
    name: "Expiring",
    value: MEMBERSHIP_OVERVIEW.expiring,
    color: "var(--color-amber-500)",
  },
  {
    name: "Frozen",
    value: MEMBERSHIP_OVERVIEW.frozen,
    color: "var(--color-sky-500)",
  },
  {
    name: "Expired",
    value: MEMBERSHIP_OVERVIEW.expired,
    color: "var(--color-red-500)",
  },
];

export function MembershipOverview({ className }: { className?: string }) {
  const total = SEGMENTS.reduce((sum, segment) => sum + segment.value, 0);

  return (
    <ChartCard
      title="Membership Overview"
      description={`${total} total memberships`}
      className={className}
    >
      <DonutChart
        segments={SEGMENTS}
        centerValue={MEMBERSHIP_OVERVIEW.active}
        centerLabel="Active"
        size={172}
      />

      <ul className="mt-5 space-y-2.5">
        {SEGMENTS.map((segment) => {
          const share = (segment.value / total) * 100;
          return (
            <li key={segment.name} className="flex items-center gap-2.5 text-sm">
              <span
                aria-hidden="true"
                className="size-2.5 shrink-0 rounded-sm"
                style={{ backgroundColor: segment.color }}
              />
              <span className="flex-1 text-neutral-600">{segment.name}</span>
              <span className="font-medium text-ink">
                {segment.value.toLocaleString()}
              </span>
              <span className="w-10 text-right text-xs text-neutral-400">
                {share.toFixed(0)}%
              </span>
            </li>
          );
        })}
      </ul>

      <Link
        href="/memberships/active"
        className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
      >
        Manage memberships
        <ArrowUpRight aria-hidden="true" className="size-3.5" />
      </Link>
    </ChartCard>
  );
}
