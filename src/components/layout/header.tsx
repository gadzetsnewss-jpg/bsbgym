"use client";

import { Menu } from "lucide-react";
import { useSidebar } from "@/hooks/use-sidebar";
import { Breadcrumbs } from "@/components/layout/breadcrumbs";
import { GlobalSearch } from "@/components/layout/global-search";
import { BranchSelector } from "@/components/layout/branch-selector";
import { NotificationBell } from "@/components/layout/notification-bell";
import { UserMenu } from "@/components/layout/user-menu";
import { QuickActionMenu } from "@/components/layout/quick-action-menu";

export function Header() {
  const { toggleMobile } = useSidebar();

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur sm:px-6">
      <button
        type="button"
        aria-label="Open navigation"
        onClick={toggleMobile}
        className="inline-flex size-10 items-center justify-center rounded-lg border border-border text-neutral-500 transition-colors hover:bg-neutral-50 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500 lg:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </button>

      <div className="min-w-0 flex-1">
        <Breadcrumbs />
      </div>

      <div className="flex items-center gap-2.5">
        <QuickActionMenu />
        <GlobalSearch className="hidden sm:inline-flex" />
        <BranchSelector className="hidden xl:inline-flex" />
        <NotificationBell className="hidden sm:block" />
        <UserMenu />
      </div>
    </header>
  );
}
