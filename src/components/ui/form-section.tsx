import * as React from "react";
import { cn } from "@/lib/utils";

export interface FormSectionProps {
  title: string;
  description?: string;
  /** Number of equal columns for the fields grid (1 or 2). */
  columns?: 1 | 2;
  className?: string;
  children: React.ReactNode;
}

export function FormSection({
  title,
  description,
  columns = 2,
  className,
  children,
}: FormSectionProps) {
  return (
    <section className={cn("rounded-card border border-border bg-surface p-5", className)}>
      <div className="mb-5">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {description && (
          <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
        )}
      </div>
      <div
        className={cn(
          "grid gap-4",
          columns === 2 ? "sm:grid-cols-2" : "grid-cols-1",
        )}
      >
        {children}
      </div>
    </section>
  );
}

/** Action row at the bottom of a form. */
export function FormActions({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mt-6 flex flex-wrap items-center justify-end gap-2",
        className,
      )}
    >
      {children}
    </div>
  );
}
