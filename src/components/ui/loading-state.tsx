import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export interface LoadingStateProps {
  label?: string;
  className?: string;
}

/** Centered spinner used inside content regions. */
export function LoadingState({ label = "Loading…", className }: LoadingStateProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "flex flex-col items-center justify-center gap-3 rounded-card border border-border bg-surface px-6 py-14",
        className,
      )}
    >
      <LoaderCircle
        aria-hidden="true"
        className="size-6 animate-spin text-primary-600"
      />
      <p className="text-sm text-neutral-500">{label}</p>
    </div>
  );
}

/** Skeleton-based loading block for tables/cards. */
export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-card border border-border bg-surface">
      <div className="flex items-center gap-4 border-b border-border px-4 py-3">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="ml-auto h-4 w-24" />
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-4 border-b border-border px-4 py-3.5 last:border-b-0"
        >
          <Skeleton className="h-4 w-48" />
          <Skeleton className="h-4 w-24" />
          <Skeleton className="ml-auto h-4 w-20" />
        </div>
      ))}
    </div>
  );
}
