"use client";

import { MoreHorizontal } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dropdown, type DropdownItem } from "@/components/ui/dropdown";

export interface RowActionsProps {
  items: DropdownItem[];
  /** Accessible label for the trigger. */
  label?: string;
  className?: string;
}

/**
 * Consistent "kebab" actions menu for table rows.
 * Wrap the Dropdown items directly when custom trigger styling is needed.
 */
export function RowActions({
  items,
  label = "Row actions",
  className,
}: RowActionsProps) {
  return (
    <Dropdown
      label={label}
      items={items}
      align="end"
      className={cn("justify-end", className)}
      triggerClassName="rounded-lg border border-transparent p-1.5 text-neutral-400 transition-colors hover:border-border hover:bg-neutral-100 hover:text-ink"
      chevron={false}
    >
      <MoreHorizontal aria-hidden="true" className="size-4" />
    </Dropdown>
  );
}
