import { cn } from "@/lib/utils";
import Link from "next/link";
import { ArrowUpRight, PackageSearch } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge, type BadgeTone } from "@/components/ui/badge";
import { LOW_STOCK } from "@/data/mock-dashboard";
import type { LowStockItem } from "@/types/dashboard";

function stockStatus(item: LowStockItem): { label: string; tone: BadgeTone } {
  if (item.current === 0) return { label: "Out of stock", tone: "danger" };
  if (item.current <= item.minimum / 2)
    return { label: "Critical", tone: "danger" };
  return { label: "Low", tone: "warning" };
}

export function LowStockAlerts({ className }: { className?: string }) {
  return (
    <Card className={cn("h-full", className)} noPadding>
      <CardHeader className="px-5 pt-5">
        <div>
          <CardTitle>Low Stock Alerts</CardTitle>
          <p className="mt-0.5 text-sm text-neutral-500">
            Products needing a reorder
          </p>
        </div>
        <Link
          href="/inventory/stock"
          className="inline-flex items-center gap-1 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          Inventory
          <ArrowUpRight aria-hidden="true" className="size-3.5" />
        </Link>
      </CardHeader>

      <ul className="divide-y divide-border">
        {LOW_STOCK.map((item) => {
          const status = stockStatus(item);
          const shortage = Math.max(item.minimum - item.current, 0);
          return (
            <li
              key={item.id}
              className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-neutral-50/70"
            >
              <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-amber-50 text-amber-600">
                <PackageSearch aria-hidden="true" className="size-4" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-ink">
                  {item.product}
                </p>
                <p className="truncate text-xs text-neutral-500">
                  {item.sku} · min {item.minimum} {item.unit}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm font-semibold text-ink">
                  {item.current} <span className="text-xs font-normal text-neutral-400">{item.unit}</span>
                </p>
                <Badge tone={status.tone} withDot className="mt-1">
                  {status.label}
                </Badge>
              </div>
              <span
                aria-hidden="true"
                className="hidden text-xs text-neutral-400 sm:block"
              >
                −{shortage}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
