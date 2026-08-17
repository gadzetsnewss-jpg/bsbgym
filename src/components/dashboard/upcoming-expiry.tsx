import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { UPCOMING_EXPIRY } from "@/data/mock-dashboard";
import type { ExpiryItem } from "@/types/dashboard";

function DaysBadge({ daysLeft }: { daysLeft: number }) {
  const tone = daysLeft <= 5 ? "danger" : daysLeft <= 10 ? "warning" : "neutral";
  const label =
    daysLeft === 0
      ? "Expires today"
      : daysLeft === 1
        ? "1 day left"
        : `${daysLeft} days left`;
  return <Badge tone={tone} withDot>{label}</Badge>;
}

export function UpcomingExpiry({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Upcoming Expiry</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Memberships ending within 30 days
          </p>
        </div>
        <Link
          href="/members/expiring"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>
      <ul className="divide-y divide-border">
        {UPCOMING_EXPIRY.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-neutral-50/70"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
              <Clock aria-hidden="true" className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-ink">{item.name}</p>
              <p className="truncate text-xs text-neutral-500">
                {item.plan} · expires {item.expiresOn}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5">
              <DaysBadge daysLeft={item.daysLeft} />
              <ButtonLink
                href="/memberships/renewals"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs"
              >
                Renew
              </ButtonLink>
            </div>
          </li>
        ))}
      </ul>
      <div className="border-t border-border px-5 py-3">
        <p className="text-xs text-neutral-400">
          <span className="font-medium text-neutral-500">36 memberships</span>{" "}
          expire in the next 30 days
        </p>
      </div>
    </Card>
  );
}
