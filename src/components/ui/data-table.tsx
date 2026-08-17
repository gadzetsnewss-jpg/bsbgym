"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ArrowUpDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/ui/empty-state";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Optional getter used for sorting. Columns without it are not sortable. */
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  headerClassName?: string;
}

export type SortDirection = "asc" | "desc";

export interface SortState {
  columnId: string;
  direction: SortDirection;
}

export interface DataTableProps<T> {
  columns: readonly Column<T>[];
  data: readonly T[];
  rowKey: (row: T) => string | number;
  onRowClick?: (row: T) => void;
  sort?: SortState | null;
  onSortChange?: (sort: SortState) => void;
  loading?: boolean;
  /** Shown when the data set is empty. */
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  page?: number;
  pageSize?: number;
  /** Total record count (defaults to data.length for client-side sets). */
  total?: number;
  onPageChange?: (page: number) => void;
  className?: string;
}

function AlignmentClass({ align }: { align?: "left" | "right" | "center" }) {
  if (align === "right") return "text-right";
  if (align === "center") return "text-center";
  return "text-left";
}

export function DataTable<T>({
  columns,
  data,
  rowKey,
  onRowClick,
  sort,
  onSortChange,
  loading = false,
  emptyTitle = "No records found",
  emptyDescription,
  emptyAction,
  page,
  pageSize,
  total,
  onPageChange,
  className,
}: DataTableProps<T>) {
  const toggleSort = (column: Column<T>) => {
    if (!onSortChange || !column.sortValue) return;
    const direction: SortDirection =
      sort?.columnId === column.id && sort.direction === "asc" ? "desc" : "asc";
    onSortChange({ columnId: column.id, direction });
  };

  const showPagination = page !== undefined && pageSize !== undefined && onPageChange;

  return (
    <div className={cn("overflow-hidden rounded-card border border-border bg-surface", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-full border-collapse text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-muted">
              {columns.map((column) => {
                const sortable = Boolean(column.sortValue);
                const active = sort?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={
                      active
                        ? sort?.direction === "asc"
                          ? "ascending"
                          : "descending"
                        : undefined
                    }
                    className={cn(
                      "px-4 py-3 text-xs font-semibold tracking-wide whitespace-nowrap uppercase text-neutral-500",
                      AlignmentClass({ align: column.align }),
                      column.headerClassName,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(column)}
                        className={cn(
                          "inline-flex items-center gap-1.5 uppercase transition-colors hover:text-ink",
                          "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1",
                          active && "text-primary-700",
                        )}
                      >
                        {column.header}
                        {active ? (
                          sort?.direction === "asc" ? (
                            <ArrowUp aria-hidden="true" className="size-3.5" />
                          ) : (
                            <ArrowDown aria-hidden="true" className="size-3.5" />
                          )
                        ) : (
                          <ArrowUpDown
                            aria-hidden="true"
                            className="size-3.5 text-neutral-300"
                          />
                        )}
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <tr key={`skeleton-${rowIndex}`} className="border-b border-border last:border-b-0">
                  {columns.map((column) => (
                    <td key={column.id} className="px-4 py-3.5">
                      <Skeleton className="h-4 w-24 max-w-full" />
                    </td>
                  ))}
                </tr>
              ))
            ) : data.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="p-4">
                  <EmptyState
                    title={emptyTitle}
                    description={emptyDescription}
                    action={undefined}
                    secondaryActions={emptyAction}
                  />
                </td>
              </tr>
            ) : (
              data.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border last:border-b-0",
                    onRowClick &&
                      "cursor-pointer transition-colors hover:bg-primary-50/50",
                  )}
                >
                  {columns.map((column) => (
                    <td
                      key={column.id}
                      className={cn(
                        "px-4 py-3.5 align-middle text-ink",
                        AlignmentClass({ align: column.align }),
                        column.className,
                      )}
                    >
                      {column.cell(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {showPagination && (
        <div className="border-t border-border px-4 py-3">
          <Pagination
            page={page as number}
            pageSize={pageSize as number}
            total={total ?? data.length}
            onPageChange={onPageChange as (p: number) => void}
          />
        </div>
      )}
    </div>
  );
}