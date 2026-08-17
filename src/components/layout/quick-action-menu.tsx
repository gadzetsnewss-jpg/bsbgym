"use client";

import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  FilePlus,
  Plus,
  ScanLine,
  Target,
  UserPlus,
} from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { QUICK_ACTIONS } from "@/data/mock-dashboard";
import { cn } from "@/lib/utils";

const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  "qa-1": UserPlus,
  "qa-2": FilePlus,
  "qa-3": ScanLine,
  "qa-4": CreditCard,
  "qa-5": Target,
};

export function QuickActionMenu({ className }: { className?: string }) {
  return (
    <Dropdown
      label="Quick actions"
      align="end"
      chevron={false}
      className={className}
      triggerClassName={cn(
        "inline-flex size-10 items-center justify-center rounded-lg bg-primary-700 text-white shadow-card transition-colors",
        "hover:bg-primary-800 active:bg-primary-900",
      )}
      items={QUICK_ACTIONS.map((action) => ({
        label: action.label,
        icon: QUICK_ACTION_ICONS[action.id] ?? FilePlus,
        href: action.href,
      }))}
    >
      <Plus aria-hidden="true" className="size-5" />
    </Dropdown>
  );
}
