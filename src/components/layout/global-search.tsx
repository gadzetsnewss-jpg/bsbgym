"use client";

import * as React from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { FLAT_NAV_ITEMS } from "@/config/navigation";
import { cn } from "@/lib/utils";
import { useToast } from "@/components/ui/toast";

export function GlobalSearch({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const { toast } = useToast();

  const results = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return FLAT_NAV_ITEMS.slice(0, 8);
    return FLAT_NAV_ITEMS.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.sectionTitle.toLowerCase().includes(q) ||
        item.href.toLowerCase().includes(q),
    ).slice(0, 8);
  }, [query]);

  React.useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  return (
    <>
      <button
        type="button"
        aria-label="Search the application"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-3 text-sm text-neutral-400 shadow-card transition-colors hover:bg-neutral-50 hover:text-neutral-600 focus-visible:ring-2 focus-visible:ring-primary-500",
          "w-10 justify-center md:w-56 md:justify-start",
          className,
        )}
      >
        <Search aria-hidden="true" className="size-4" />
        <span className="hidden md:inline">Search…</span>
        <kbd className="ml-auto hidden rounded border border-border bg-neutral-50 px-1.5 py-0.5 font-mono text-[11px] text-neutral-400 md:inline">
          /
        </kbd>
      </button>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Search"
        description="Jump to any module in BSB FitForge."
        size="lg"
      >
        <div className="relative mb-3">
          <Search
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400"
          />
          <input
            autoFocus
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Type to search members, billing, reports…"
            aria-label="Search modules"
            className="h-11 w-full rounded-lg border border-border bg-white pr-3 pl-9 text-sm text-ink shadow-card transition-colors placeholder:text-neutral-400 focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25"
          />
        </div>

        <ul className="space-y-1">
          {results.map((item) => {
            const Icon = item.icon;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-ink transition-colors hover:bg-primary-50 focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary-50 text-primary-700">
                    <Icon aria-hidden="true" className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium">{item.title}</span>
                    <span className="block truncate text-xs text-neutral-400">
                      {item.sectionTitle} · {item.href}
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
          {results.length === 0 && (
            <li className="px-3 py-8 text-center text-sm text-neutral-400">
              No modules match “{query}”.
            </li>
          )}
        </ul>
      </Modal>
    </>
  );
}
