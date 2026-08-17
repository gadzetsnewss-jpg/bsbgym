import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  /** Right-aligned action slot (buttons, links, toggles). */
  actions?: React.ReactNode;
  className?: string;
}

export function PageHeader({
  title,
  description,
  icon: Icon,
  actions,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-wrap items-start justify-between gap-4", className)}>
      <div className="flex items-start gap-3">
        {Icon && (
          <div className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
            <Icon aria-hidden="true" className="size-5" />
          </div>
        )}
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-2xl">
            {title}
          </h1>
          {description && (
            <p className="mt-1 text-sm text-neutral-500">{description}</p>
          )}
        </div>
      </div>
      {actions && (
        <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
      )}
    </header>
  );
}
