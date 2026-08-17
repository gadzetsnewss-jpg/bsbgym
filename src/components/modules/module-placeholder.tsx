import Link from "next/link";
import { ArrowLeft, Construction } from "lucide-react";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Badge } from "@/components/ui/badge";
import { findNavItem } from "@/config/navigation";

export interface ModulePlaceholderProps {
  /** Route href, used to resolve title/description/icon from nav config. */
  href: string;
  /** Optional planned capability list. Defaults to standard Phase 1 items. */
  planned?: string[];
  className?: string;
}

const DEFAULT_PLANNED = [
  "Supabase data model and database migrations",
  "CRUD screens built on the shared UI primitives",
  "Row-level security and role-based access control",
  "Realtime updates and activity feeds",
];

export function ModulePlaceholder({
  href,
  planned = DEFAULT_PLANNED,
  className,
}: ModulePlaceholderProps) {
  const item = findNavItem(href);
  const title = item?.title ?? href.split("/").pop() ?? "Module";
  const description =
    item?.description ??
    "This module is part of the BSB FitForge roadmap and will be implemented in a future phase.";

  return (
    <div className={cn("space-y-6", className)}>
      <PageHeader
        title={title}
        description={description}
        icon={item?.icon}
        actions={
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-1.5 text-sm font-medium text-neutral-500 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 rounded-md"
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to Dashboard
          </Link>
        }
      />

      <Card>
        <div className="flex items-start gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Construction aria-hidden="true" className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-semibold text-ink">
                {title} — route ready
              </h2>
              <Badge tone="primary">Phase 0 foundation</Badge>
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-neutral-500">
              This is a reserved route in the BSB FitForge application shell.
              The module will be built in a future phase and will plug straight
              into the existing sidebar navigation, design system and Supabase
              architecture — no restructuring required.
            </p>
          </div>
        </div>

        <div className="mt-6">
          <h3 className="mb-3 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
            Planned for Phase 1+
          </h3>
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {planned.map((itemText) => (
              <li
                key={itemText}
                className="flex items-start gap-2 rounded-lg border border-border bg-surface-muted px-3 py-2.5 text-sm text-neutral-600"
              >
                <span
                  aria-hidden="true"
                  className="mt-1.5 size-1.5 shrink-0 rounded-full bg-primary-500"
                />
                {itemText}
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <EmptyState
        title={`${title} coming soon`}
        description="This module is scheduled for a future phase. Use the dashboard or search to explore the foundation that is already in place."
        icon={item?.icon}
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    </div>
  );
}
