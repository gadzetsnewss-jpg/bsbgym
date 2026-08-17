"use client";

import * as React from "react";
import { CalendarDays, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dropdown } from "@/components/ui/dropdown";

export interface DateRangePreset {
  value: string;
  label: string;
}

export const DEFAULT_DATE_RANGE_PRESETS: readonly DateRangePreset[] = [
  { value: "today", label: "Today" },
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "this-month", label: "This month" },
  { value: "last-month", label: "Last month" },
  { value: "this-quarter", label: "This quarter" },
  { value: "this-year", label: "This year" },
];

export interface DateRangePickerProps {
  value: string;
  onValueChange: (value: string) => void;
  presets?: readonly DateRangePreset[];
  className?: string;
  /** Custom label override, e.g. a fixed range string. */
  label?: string;
}

/**
 * Date range picker placeholder.
 *
 * Provides preset ranges only. A full calendar/custom-range picker is
 * intentionally deferred to a later phase — no date libraries are added.
 */
export function DateRangePicker({
  value,
  onValueChange,
  presets = DEFAULT_DATE_RANGE_PRESETS,
  className,
  label,
}: DateRangePickerProps) {
  const activePreset = presets.find((preset) => preset.value === value);

  const items = presets.map((preset) => ({
    label: preset.label,
    icon: preset.value === value ? Check : undefined,
    onClick: () => onValueChange(preset.value),
  }));

  return (
    <Dropdown
      label="Date range"
      items={items}
      align="end"
      className={className}
      triggerClassName="h-9 inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm font-medium text-ink shadow-card transition-colors hover:bg-neutral-50"
    >
      <CalendarDays aria-hidden="true" className="size-4 text-neutral-400" />
      {label ?? activePreset?.label ?? "Select range"}
    </Dropdown>
  );
}
