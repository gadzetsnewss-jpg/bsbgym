"use client";

import * as React from "react";
import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SearchBarProps {
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  "aria-label"?: string;
}

/**
 * Debounced search input used across list pages.
 * Controls are kept uncontrolled externally - pages own the debounced state.
 */
export function SearchBar({
  value,
  onValueChange,
  placeholder = "Search…",
  className,
  "aria-label": ariaLabel = "Search",
}: SearchBarProps) {
  return (
    <div className={cn("relative", className)}>
      <Search
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
      />
      <input
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        placeholder={placeholder}
        aria-label={ariaLabel}
        className="h-10 w-full rounded-lg border border-border bg-white pr-3 pl-9 text-sm text-ink shadow-card transition-colors placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25 sm:w-64"
      />
    </div>
  );
}