"use client";

import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusBadge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { RECENT_MEMBERS } from "@/data/mock-dashboard";
import type { MemberRow } from "@/types/dashboard";

const columns: Column<MemberRow>[] = [
  {
    id: "member",
    header: "Member",
    cell: (row) => (
      <div className="flex items-center gap-2.5 whitespace-nowrap">
        <UserAvatar name={row.name} size="sm" />
        <span className="font-medium text-ink">{row.name}</span>
      </div>
    ),
  },
  {
    id: "plan",
    header: "Membership",
    cell: (row) => <span className="whitespace-nowrap">{row.plan}</span>,
  },
  {
    id: "trainer",
    header: "Trainer",
    cell: (row) => (
      <span className="whitespace-nowrap text-neutral-500">{row.trainer}</span>
    ),
  },
  {
    id: "status",
    header: "Status",
    cell: (row) => <StatusBadge status={row.status} />,
  },
  {
    id: "joined",
    header: "Joined",
    cell: (row) => (
      <span className="whitespace-nowrap text-neutral-500">{row.joinedOn}</span>
    ),
  },
];

export function RecentMembers({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Recent Members</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Newest member profiles
          </p>
        </div>
        <Link
          href="/members"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          View all
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>
      <DataTable columns={columns} data={RECENT_MEMBERS} rowKey={(row) => row.id} />
    </Card>
  );
}
