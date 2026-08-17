"use client";

import * as React from "react";
import { Filter } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface FilterBarProps {
  children: React.ReactNode;
  /** Number of active filters (renders a clear-all button when > 0). */
  activeCount?: number;
  onClear?: () => void;
  className?: string;
}

export function FilterBar({
  children,
  activeCount = 0,
  onClear,
  className,
}: FilterBarProps) {
  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-card border border-border bg-surface px-3 py-2.5",
        className,
      )}
    >
      <Filter
        aria-hidden="true"
        className="mr-1 size-4 shrink-0 text-neutral-400"
      />
      {children}
      {activeCount > 0 && onClear && (
        <Button variant="ghost" size="sm" onClick={onClear}>
          Clear filters{activeCount > 0 ? ` (${activeCount})` : ""}
        </Button>
      )}
    </div>
  );
}