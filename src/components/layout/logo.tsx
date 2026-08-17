import * as React from "react";
import { Dumbbell } from "lucide-react";
import { cn } from "@/lib/utils";

export interface LogoProps {
  /** Text/wordmark color theme (sidebar is dark, pages are light). */
  variant?: "light" | "dark";
  /** Hides the wordmark, showing only the mark. */
  compact?: boolean;
  className?: string;
  markClassName?: string;
}

/**
 * BSB FitForge logo placeholder.
 *
 * Swap the visual mark here without touching any layout that renders <Logo />.
 */
export function Logo({
  variant = "dark",
  compact = false,
  className,
  markClassName,
}: LogoProps) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <div
        className={cn(
          "flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-card",
          markClassName,
        )}
        aria-hidden="true"
      >
        <Dumbbell className="size-5" strokeWidth={2.2} />
      </div>
      {!compact && (
        <span
          className={cn(
            "select-none text-lg font-semibold tracking-tight whitespace-nowrap",
            variant === "dark" ? "text-white" : "text-ink",
          )}
        >
          BSB{" "}
          <span
            className={cn(
              variant === "dark" ? "text-primary-300" : "text-primary-700",
            )}
          >
            FitForge
          </span>
        </span>
      )}
    </div>
  );
}
