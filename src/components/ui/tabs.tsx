"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface TabItem {
  value: string;
  label: string;
  icon?: LucideIcon;
  badge?: string | number;
}

export interface TabsProps {
  items: readonly TabItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** Optional panel content rendered below the tab list. */
  children?: React.ReactNode;
  className?: string;
  /** aria-label for the tab list. */
  "aria-label"?: string;
  /** Visual style. "underline" for page-level tabs, "pills" for in-card use. */
  variant?: "underline" | "pills";
}

export function Tabs({
  items,
  value,
  onValueChange,
  children,
  className,
  "aria-label": ariaLabel = "Tabs",
  variant = "underline",
}: TabsProps) {
  const tabRefs = React.useRef<Array<HTMLButtonElement | null>>([]);

  const onKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const index = items.findIndex((item) => item.value === value);
    if (index < 0) return;
    let next = index;
    if (event.key === "ArrowRight") next = (index + 1) % items.length;
    else if (event.key === "ArrowLeft")
      next = (index - 1 + items.length) % items.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    else return;
    event.preventDefault();
    const item = items[next];
    onValueChange(item.value);
    tabRefs.current[next]?.focus();
  };

  return (
    <div className={cn("w-full", className)}>
      <div
        role="tablist"
        aria-label={ariaLabel}
        className={cn(
          "flex flex-wrap gap-1",
          variant === "underline" && "border-b border-border",
          variant === "pills" && "rounded-lg bg-surface-muted p-1",
        )}
      >
        {items.map((item, index) => {
          const selected = item.value === value;
          const Icon = item.icon;
          return (
            <button
              key={item.value}
              ref={(el) => {
                tabRefs.current[index] = el;
              }}
              role="tab"
              type="button"
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onValueChange(item.value)}
              onKeyDown={onKeyDown}
              className={cn(
                "inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium transition-colors",
                "focus-visible:ring-2 focus-visible:ring-primary-500",
                variant === "underline" && cn(
                  "-mb-px rounded-t-lg border-b-2",
                  selected
                    ? "border-primary-600 text-primary-800"
                    : "border-transparent text-neutral-500 hover:border-neutral-300 hover:text-ink",
                ),
                variant === "pills" && cn(
                  "rounded-md",
                  selected
                    ? "bg-surface text-ink shadow-card"
                    : "text-neutral-500 hover:text-ink",
                ),
              )}
            >
              {Icon && <Icon aria-hidden="true" className="size-4" />}
              {item.label}
              {item.badge !== undefined && (
                <span
                  className={cn(
                    "rounded-full px-1.5 py-px text-[11px] font-semibold",
                    selected
                      ? "bg-primary-100 text-primary-800"
                      : "bg-neutral-100 text-neutral-500",
                  )}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>
      {children && (
        <div role="tabpanel" className="pt-4">
          {children}
        </div>
      )}
    </div>
  );
}