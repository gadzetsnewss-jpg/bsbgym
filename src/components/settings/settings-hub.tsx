"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Bell,
  Building2,
  FileText,
  Printer,
  Shield,
  SlidersHorizontal,
  Store,
  BadgeCheck,
  Wallet,
  ShieldCheck,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { SETTINGS_CATEGORIES, type SettingsCategoryId } from "@/lib/org/settings-catalog";
import { cn } from "@/lib/utils";

const ICONS: Record<SettingsCategoryId, React.ComponentType<{ className?: string }>> = {
  general: SlidersHorizontal,
  business: Building2,
  branches: Store,
  tax: ShieldCheck,
  locale: BadgeCheck,
  membership: BadgeCheck,
  billing: FileText,
  payments: Wallet,
  print: Printer,
  notifications: Bell,
  security: Shield,
};

export function SettingsHubShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { can } = useOrganization();
  const items = SETTINGS_CATEGORIES.filter((item) => can(item.permission) || item.id === "general");

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-800">
        Change it once in Settings. All relevant screens use it automatically.
      </p>
      <div className="grid gap-5 lg:grid-cols-[240px_minmax(0,1fr)]">
        <nav aria-label="Settings categories" className="lg:sticky lg:top-20 lg:self-start">
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {items.map((item) => {
              const Icon = ICONS[item.id];
              const active =
                pathname === item.href ||
                (item.href !== "/settings/general" && pathname.startsWith(item.href));
              return (
                <li key={item.id} className="shrink-0">
                  <Link
                    href={item.href}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary-50 text-primary-800"
                        : "text-neutral-600 hover:bg-neutral-50 hover:text-ink",
                    )}
                  >
                    <Icon className="size-4 shrink-0" />
                    {item.title}
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
        <div className="min-w-0">{children}</div>
      </div>
    </div>
  );
}

export function SettingsHubHome() {
  const { organization, can } = useOrganization();
  const [query, setQuery] = React.useState("");
  const items = SETTINGS_CATEGORIES.filter((item) => {
    if (!(can(item.permission) || item.id === "general")) return false;
    if (!query.trim()) return true;
    const haystack = `${item.title} ${item.description} ${item.keywords}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  if (!organization) {
    return (
      <EmptyState
        title="Settings unavailable"
        description="Sign in with an organization to manage workspace defaults."
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Single source of truth for branding, tax, billing, payments and printing."
        icon={SlidersHorizontal}
      />
      <p className="rounded-lg border border-primary-100 bg-primary-50 px-3 py-2 text-sm text-primary-800">
        Change it once in Settings. All relevant screens use it automatically.
      </p>
      <input
        type="search"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search settings"
        aria-label="Search settings"
        className="h-10 w-full max-w-md rounded-lg border border-border bg-white px-3 text-sm text-ink shadow-card"
      />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {items.map((item) => {
          const Icon = ICONS[item.id];
          return (
            <Link key={item.id} href={item.href} className="block">
              <Card className="h-full transition-colors hover:border-primary-200">
                <CardHeader>
                  <div className="flex items-start gap-3">
                    <span className="flex size-10 items-center justify-center rounded-lg bg-primary-50 text-primary-700">
                      <Icon className="size-5" />
                    </span>
                    <div>
                      <CardTitle>{item.title}</CardTitle>
                      <CardDescription>{item.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
              </Card>
            </Link>
          );
        })}
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-neutral-500">No settings match that search.</p>
      ) : null}
    </div>
  );
}
