import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function ReportStat({
  label,
  value,
  hint,
  icon: Icon,
  tone = "neutral",
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: LucideIcon;
  tone?: "neutral" | "warning" | "success" | "primary";
}) {
  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-medium tracking-wide text-neutral-500 uppercase">{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex size-7 items-center justify-center rounded-md",
              tone === "warning" && "bg-amber-50 text-amber-600",
              tone === "success" && "bg-emerald-50 text-emerald-600",
              tone === "primary" && "bg-primary-50 text-primary-700",
              tone === "neutral" && "bg-neutral-100 text-neutral-500",
            )}
          >
            <Icon aria-hidden="true" className="size-4" />
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 text-2xl font-semibold tabular-nums",
          tone === "warning" && "text-amber-700",
          tone === "success" && "text-emerald-700",
          tone === "primary" && "text-primary-800",
          tone === "neutral" && "text-ink",
        )}
      >
        {value}
      </p>
      {hint && <p className="mt-0.5 text-xs text-neutral-500">{hint}</p>}
    </Card>
  );
}
