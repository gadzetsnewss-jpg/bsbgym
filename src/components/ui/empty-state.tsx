
import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { Inbox } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button, ButtonLink, type ButtonVariant } from "@/components/ui/button";

export interface EmptyStateProps {
  title: string;
  description?: string;
  icon?: LucideIcon;
  className?: string;
  /** Primary call-to-action. */
  action?: {
    label: string;
    href?: string;
    onClick?: () => void;
    icon?: LucideIcon;
    variant?: ButtonVariant;
  };
  /** Secondary action(s). */
  secondaryActions?: React.ReactNode;
}

export function EmptyState({
  title,
  description,
  icon: Icon = Inbox,
  className,
  action,
  secondaryActions,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-surface px-6 py-14 text-center",
        className,
      )}
    >
      <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-primary-50 text-primary-600">
        <Icon aria-hidden="true" className="size-6" />
      </div>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && (
        <p className="mt-1 max-w-sm text-sm text-neutral-500">{description}</p>
      )}
      {(action || secondaryActions) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action &&
            (action.href ? (
              <ButtonLink
                variant={action.variant ?? "primary"}
                href={action.href}
              >
                {action.icon && (
                  <action.icon aria-hidden="true" className="size-4" />
                )}
                {action.label}
              </ButtonLink>
            ) : (
              <Button
                variant={action.variant ?? "primary"}
                onClick={action.onClick}
              >
                {action.icon && (
                  <action.icon aria-hidden="true" className="size-4" />
                )}
                {action.label}
              </Button>
            ))}
          {secondaryActions}
        </div>
      )}
    </div>
  );
}