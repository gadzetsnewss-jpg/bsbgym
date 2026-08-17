"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

export interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  className?: string;
  /** Maximum page buttons rendered on each side of the current page. */
  siblingCount?: number;
}

function pageWindow(page: number, totalPages: number, sibling: number) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  const pages = new Set<number>([1, totalPages, page]);
  for (let i = page - sibling; i <= page + sibling; i++) {
    if (i >= 1 && i <= totalPages) pages.add(i);
  }
  return [...pages].sort((a, b) => a - b);
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  className,
  siblingCount = 1,
}: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(page * pageSize, total);
  const pages = pageWindow(page, totalPages, siblingCount);

  return (
    <nav
      aria-label="Pagination"
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 text-sm text-neutral-500",
        className,
      )}
    >
      <p className="whitespace-nowrap">
        Showing <span className="font-medium text-ink">{start}</span>–
        <span className="font-medium text-ink">{end}</span> of{" "}
        <span className="font-medium text-ink">{total}</span>
      </p>

      <div className="flex items-center gap-1">
        <Button
          variant="outline"
          size="sm"
          aria-label="Previous page"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          <ChevronLeft aria-hidden="true" className="size-4" />
          <span className="sr-only">Previous</span>
        </Button>

        {pages.map((p, index) => {
          const prev = pages[index - 1];
          const showEllipsis = prev !== undefined && p - prev > 1;
          const current = p === page;
          return (
            <React.Fragment key={p}>
              {showEllipsis && (
                <span aria-hidden="true" className="px-1 text-neutral-400">
                  …
                </span>
              )}
              <button
                type="button"
                aria-current={current ? "page" : undefined}
                aria-label={`Page ${p}`}
                onClick={() => onPageChange(p)}
                className={cn(
                  "h-8 min-w-8 rounded-lg px-2 text-sm font-medium transition-colors",
                  "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                  current
                    ? "bg-primary-700 text-white"
                    : "text-ink hover:bg-neutral-100",
                )}
              >
                {p}
              </button>
            </React.Fragment>
          );
        })}

        <Button
          variant="outline"
          size="sm"
          aria-label="Next page"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          <span className="sr-only">Next</span>
          <ChevronRight aria-hidden="true" className="size-4" />
        </Button>
      </div>
    </nav>
  );
}