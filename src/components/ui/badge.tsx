import * as React from "react";
import { cn } from "@/lib/utils";

export type BadgeTone =
  | "neutral"
  | "primary"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "accent";

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  /** Renders a small status dot before the label. */
  withDot?: boolean;
}

const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-neutral-100 text-neutral-700 border-neutral-200",
  primary: "bg-primary-50 text-primary-800 border-primary-200",
  success: "bg-emerald-50 text-emerald-800 border-emerald-200",
  warning: "bg-amber-50 text-amber-800 border-amber-200",
  danger: "bg-red-50 text-red-700 border-red-200",
  info: "bg-sky-50 text-sky-800 border-sky-200",
  accent: "bg-accent-50 text-accent-700 border-accent-200",
};

const dotClasses: Record<BadgeTone, string> = {
  neutral: "bg-neutral-400",
  primary: "bg-primary-600",
  success: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  accent: "bg-accent-500",
};

export function Badge({
  className,
  tone = "neutral",
  withDot = false,
  children,
  ...props
}: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap",
        toneClasses[tone],
        className,
      )}
      {...props}
    >
      {withDot && (
        <span
          aria-hidden="true"
          className={cn("size-1.5 shrink-0 rounded-full", dotClasses[tone])}
        />
      )}
      {children}
    </span>
  );
}

/** Normalized status string -> badge tone. Presentation-only mapping. */
const STATUS_TONE: Record<string, BadgeTone> = {
  active: "success",
  paid: "success",
  completed: "success",
  won: "success",
  renewed: "success",
  confirmed: "success",
  "in stock": "success",
  "in-stock": "success",

  inactive: "neutral",
  draft: "neutral",
  new: "info",
  scheduled: "info",

  pending: "warning",
  expiring: "warning",
  "partially paid": "warning",
  "follow up": "warning",
  "follow-up": "warning",
  trial: "info",

  overdue: "danger",
  expired: "danger",
  frozen: "danger",
  paused: "danger",
  failed: "danger",
  cancelled: "danger",
  canceled: "danger",
  refunded: "danger",
  lost: "danger",
  "out of stock": "danger",
  "out-of-stock": "danger",
};

export interface StatusBadgeProps {
  status: string;
  className?: string;
  withDot?: boolean;
}

/** Human-friendly status badge with an inferred tone. */
export function StatusBadge({ status, className, withDot = true }: StatusBadgeProps) {
  const tone = STATUS_TONE[status.toLowerCase()] ?? "neutral";
  return (
    <Badge tone={tone} withDot={withDot} className={className}>
      {status}
    </Badge>
  );
}
