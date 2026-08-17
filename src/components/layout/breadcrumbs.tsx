"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { findNavItem } from "@/config/navigation";

export interface Crumb {
  title: string;
  href?: string;
}

function buildCrumbs(pathname: string): Crumb[] {
  const parts = pathname.split("/").filter(Boolean);
  const crumbs: Crumb[] = [{ title: "Home", href: "/dashboard" }];
  let current = "";

  for (const part of parts) {
    current += `/${part}`;
    const item = findNavItem(current);
    if (item) crumbs.push({ title: item.title, href: current });
  }

  return crumbs;
}

export function Breadcrumbs({ className }: { className?: string }) {
  const pathname = usePathname();
  const crumbs = React.useMemo(() => buildCrumbs(pathname), [pathname]);

  return (
    <nav aria-label="Breadcrumb" className={cn("min-w-0", className)}>
      <ol className="flex items-center gap-1 overflow-x-auto whitespace-nowrap text-sm">
        {crumbs.map((crumb, index) => {
          const isLast = index === crumbs.length - 1;
          return (
            <React.Fragment key={`${crumb.title}-${index}`}>
              {index > 0 && (
                <li aria-hidden="true">
                  <ChevronRight className="size-4 shrink-0 text-neutral-300" />
                </li>
              )}
              <li className="min-w-0">
                {isLast || !crumb.href ? (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className={cn(
                      "block truncate",
                      isLast
                        ? "font-medium text-ink"
                        : "text-neutral-500",
                    )}
                  >
                    {crumb.title}
                  </span>
                ) : (
                  <Link
                    href={crumb.href}
                    className="block truncate text-neutral-500 transition-colors hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500"
                  >
                    {crumb.title}
                  </Link>
                )}
              </li>
            </React.Fragment>
          );
        })}
      </ol>
    </nav>
  );
}
