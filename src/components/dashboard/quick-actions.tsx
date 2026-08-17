import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  FilePlus,
  ScanLine,
  ShoppingCart,
  Target,
  UserPlus,
  ArrowUpRight,
} from "lucide-react";
import Link from "next/link";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { QUICK_ACTIONS } from "@/data/mock-dashboard";
import type { QuickAction } from "@/types/dashboard";

const ICON_MAP: Record<string, LucideIcon> = {
  "qa-1": UserPlus,
  "qa-2": FilePlus,
  "qa-3": CreditCard,
  "qa-4": ShoppingCart,
  "qa-5": ScanLine,
  "qa-6": Target,
};

const FALLBACK_ICON = FilePlus;

function ActionTile({ action }: { action: QuickAction }) {
  const Icon = ICON_MAP[action.id] ?? FALLBACK_ICON;
  return (
    <Link
      href={action.href}
      className="group flex items-center gap-3 rounded-lg border border-border bg-surface p-3 shadow-card transition-colors hover:border-primary-200 hover:bg-primary-50/50 focus-visible:ring-2 focus-visible:ring-primary-500"
    >
      <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700 transition-colors group-hover:bg-primary-100">
        <Icon aria-hidden="true" className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
        {action.label}
      </span>
      <ArrowUpRight
        aria-hidden="true"
        className="size-4 shrink-0 text-neutral-300 transition-colors group-hover:text-primary-600"
      />
    </Link>
  );
}

export function QuickActions() {
  return (
    <Card className="h-full">
      <CardHeader>
        <div>
          <CardTitle>Quick Actions</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Jump straight into common tasks
          </p>
        </div>
      </CardHeader>
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-1">
        {QUICK_ACTIONS.map((action) => (
          <li key={action.id}>
            <ActionTile action={action} />
          </li>
        ))}
      </ul>
    </Card>
  );
}
