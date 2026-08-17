"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Sparkles, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { NAV_SECTIONS } from "@/config/navigation";
import { useSidebar } from "@/hooks/use-sidebar";
import { Logo } from "@/components/layout/logo";
import type { NavItem } from "@/types/navigation";

function isActive(href: string, pathname: string): boolean {
  return href === pathname;
}

interface NavLinkProps {
  item: NavItem;
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}

function NavLink({ item, collapsed, pathname, onNavigate }: NavLinkProps) {
  const active = isActive(item.href, pathname);
  const Icon = item.icon;

  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      title={collapsed ? item.title : undefined}
      className={cn(
        "group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
        "focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-primary-950",
        collapsed && "justify-center px-0",
        active
          ? "bg-white/10 text-white"
          : "text-primary-100/70 hover:bg-white/5 hover:text-white",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute top-1/2 left-0 h-5 w-0.5 -translate-y-1/2 rounded-full bg-primary-400 transition-opacity",
          active ? "opacity-100" : "opacity-0",
        )}
      />
      <Icon
        aria-hidden="true"
        className={cn(
          "size-5 shrink-0",
          active ? "text-primary-300" : "text-primary-100/60",
        )}
      />
      {!collapsed && <span className="min-w-0 flex-1 truncate">{item.title}</span>}
      {!collapsed && item.badge && (
        <span className="rounded-full bg-primary-500/20 px-1.5 py-0.5 text-[11px] font-semibold text-primary-200">
          {item.badge}
        </span>
      )}
    </Link>
  );
}

interface SidebarNavProps {
  collapsed: boolean;
  pathname: string;
  onNavigate?: () => void;
}

function SidebarNav({ collapsed, pathname, onNavigate }: SidebarNavProps) {
  return (
    <nav aria-label="Main navigation" className="flex-1 overflow-y-auto px-3 pb-4">
      {NAV_SECTIONS.map((section) => (
        <div key={section.id} className="mt-4 first:mt-0">
          {!collapsed ? (
            <p className="px-3 pb-1.5 text-[11px] font-semibold tracking-wider text-primary-100/40 uppercase">
              {section.title}
            </p>
          ) : (
            section.id !== "dashboard" && (
              <div
                aria-hidden="true"
                className="mx-2 mb-1 h-px bg-white/10"
              />
            )
          )}
          <ul className="space-y-0.5">
            {section.items.map((item) => (
              <li key={item.href}>
                <NavLink
                  item={item}
                  collapsed={collapsed}
                  pathname={pathname}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </div>
      ))}
    </nav>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  return (
    <div className="border-t border-white/10 p-3">
      {collapsed ? (
        <div
          title="BSB FitForge Starter plan"
          className="flex size-9 items-center justify-center rounded-lg bg-white/5 text-primary-300"
        >
          <Sparkles aria-hidden="true" className="size-4" />
        </div>
      ) : (
        <div className="rounded-lg bg-gradient-to-br from-white/10 to-white/5 p-3">
          <div className="flex items-center gap-2">
            <Sparkles aria-hidden="true" className="size-4 text-primary-300" />
            <p className="text-xs font-semibold text-white">Starter plan</p>
          </div>
          <p className="mt-1 text-[11px] leading-snug text-primary-100/60">
            Upgrade to unlock billing, POS and multi-branch tools.
          </p>
        </div>
      )}
    </div>
  );
}

export function Sidebar() {
  const { collapsed, toggleCollapsed, mobileOpen, closeMobile } = useSidebar();
  const pathname = usePathname();

  return (
    <>
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col bg-primary-950 transition-all duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-64",
        )}
      >
        <div className={cn("flex h-16 shrink-0 items-center border-b border-white/10", collapsed ? "justify-center px-0" : "px-5")}>
          <Logo variant="light" compact={collapsed} />
        </div>
        <SidebarNav collapsed={collapsed} pathname={pathname} />
        <SidebarFooter collapsed={collapsed} />
        <button
          type="button"
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="absolute -right-3 top-[76px] flex size-6 items-center justify-center rounded-full border border-border bg-surface text-neutral-400 shadow-card transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {collapsed ? (
            <ChevronsRight aria-hidden="true" className="size-3.5" />
          ) : (
            <ChevronsLeft aria-hidden="true" className="size-3.5" />
          )}
        </button>
      </aside>

      {/* Mobile off-canvas navigation */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div
            aria-hidden="true"
            className="absolute inset-0 bg-ink/50 backdrop-blur-[2px]"
            onClick={closeMobile}
          />
          <aside className="absolute inset-y-0 left-0 flex w-72 max-w-[85vw] flex-col bg-primary-950 shadow-modal">
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-5">
              <Logo variant="light" />
              <button
                type="button"
                aria-label="Close navigation"
                onClick={closeMobile}
                className="rounded-lg p-1.5 text-primary-100/60 transition-colors hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            </div>
            <SidebarNav collapsed={false} pathname={pathname} onNavigate={closeMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
