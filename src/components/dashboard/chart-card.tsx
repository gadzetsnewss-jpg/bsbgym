import * as React from "react";
import { Card } from "@/components/ui/card";

export interface ChartCardProps {
  title: string;
  description?: string;
  /** Optional legend / controls rendered in the header. */
  headerExtra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

export function ChartCard({
  title,
  description,
  headerExtra,
  children,
  className,
}: ChartCardProps) {
  return (
    <Card className={className}>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold tracking-tight text-ink">{title}</h3>
          {description && (
            <p className="mt-0.5 text-sm text-neutral-500">{description}</p>
          )}
        </div>
        {headerExtra && <div>{headerExtra}</div>}
      </div>
      {children}
    </Card>
  );
}
