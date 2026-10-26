"use client";

import * as React from "react";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";

export interface BranchOption {
  id: string;
  name: string;
  code: string;
}

export interface FinanceScopeFiltersProps {
  from: string;
  to: string;
  branchId: string;
  branches: readonly BranchOption[];
  onFromChange: (value: string) => void;
  onToChange: (value: string) => void;
  onBranchChange: (value: string) => void;
  onClear: () => void;
  className?: string;
  children?: React.ReactNode;
}

/** Shared date-range + branch filter used by every finance screen. */
export function FinanceScopeFilters({
  from,
  to,
  branchId,
  branches,
  onFromChange,
  onToChange,
  onBranchChange,
  onClear,
  className,
  children,
}: FinanceScopeFiltersProps) {
  const activeCount = [Boolean(from), Boolean(to), branchId !== "all"].filter(Boolean).length;
  return (
    <FilterBar className={className} activeCount={activeCount} onClear={onClear}>
      {children}
      <Select
        aria-label="Branch"
        className="w-full sm:w-48"
        value={branchId}
        onChange={(event) => onBranchChange(event.target.value)}
        options={[
          { value: "all", label: "All branches" },
          ...branches.map((branch) => ({
            value: branch.id,
            label: `${branch.name} (${branch.code})`,
          })),
        ]}
      />
      <input
        type="date"
        aria-label="From date"
        className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
        value={from}
        onChange={(event) => onFromChange(event.target.value)}
      />
      <input
        type="date"
        aria-label="To date"
        className="h-10 rounded-lg border border-border bg-white px-3 text-sm"
        value={to}
        onChange={(event) => onToChange(event.target.value)}
      />
    </FilterBar>
  );
}
