import type { LucideIcon } from "lucide-react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import type { KpiMetric } from "@/types/dashboard";

export type KpiTone = "default" | "warning" | "accent";

export interface KpiCardProps {
  metric: KpiMetric;
  icon: LucideIcon;
  tone?: KpiTone;
}

const toneClasses: Record<KpiTone, string> = {
  default: "bg-primary-50 text-primary-700",
  warning: "bg-amber-50 text-amber-600",
  accent: "bg-accent-50 text-accent-600",
};

function DeltaBadge({ metric }: { metric: KpiMetric }) {
  if (metric.delta === undefined) return null;
  const Icon = metric.trend === "up" ? ArrowUp : metric.trend === "down" ? ArrowDown : Minus;
  const goodDirection = metric.trendGoodDirection ?? "up";
  const isGood = metric.trend === goodDirection;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold",
        metric.trend === "flat" && "bg-neutral-100 text-neutral-500",
        isGood && metric.trend !== "flat" && "bg-emerald-50 text-emerald-700",
        !isGood && metric.trend !== "flat" && "bg-red-50 text-red-600",
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {Math.abs(metric.delta)}%
    </span>
  );
}

export function KpiCard({ metric, icon: Icon, tone = "default" }: KpiCardProps) {
  return (
    <Card className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-sm font-medium text-neutral-500">{metric.label}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight text-ink sm:text-[1.7rem]">
          {metric.value}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <DeltaBadge metric={metric} />
          {metric.hint && (
            <span className="text-xs text-neutral-400">{metric.hint}</span>
          )}
        </div>
      </div>
      <div
        className={cn(
          "flex size-10 shrink-0 items-center justify-center rounded-lg",
          toneClasses[tone],
        )}
      >
        <Icon aria-hidden="true" className="size-5" />
      </div>
    </Card>
  );
}
