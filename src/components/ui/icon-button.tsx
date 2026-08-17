import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  /** Accessible label (also used as tooltip title). */
  label: string;
  icon: LucideIcon;
  variant?: "ghost" | "outline" | "secondary";
  size?: "sm" | "md";
}

/** Icon-only button used for header actions and table controls. */
export function IconButton({
  label,
  icon: Icon,
  variant = "outline",
  size = "md",
  className,
  ...props
}: IconButtonProps) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-lg transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "ghost" &&
          "text-neutral-500 hover:bg-neutral-100 hover:text-ink",
        variant === "outline" &&
          "border border-border bg-surface text-neutral-500 shadow-card hover:bg-neutral-50 hover:text-ink",
        variant === "secondary" &&
          "bg-primary-50 text-primary-700 hover:bg-primary-100",
        size === "sm" ? "size-8" : "size-10",
        className,
      )}
      {...props}
    >
      <Icon
        aria-hidden="true"
        className={size === "sm" ? "size-4" : "size-5"}
      />
    </button>
  );
}
