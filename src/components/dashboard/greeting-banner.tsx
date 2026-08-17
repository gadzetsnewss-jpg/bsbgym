"use client";

import * as React from "react";
import type { LucideIcon } from "lucide-react";
import {
  CreditCard,
  FilePlus,
  ScanLine,
  Target,
  UserPlus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { QUICK_ACTIONS } from "@/data/mock-dashboard";
import { CURRENT_USER } from "@/data/mock-org";

const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  "qa-1": UserPlus,
  "qa-2": FilePlus,
  "qa-3": ScanLine,
  "qa-4": CreditCard,
  "qa-5": Target,
};

const dateFormatter = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function greetingFor(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function GreetingBanner() {
  const [dateLabel, setDateLabel] = React.useState("");
  const [greeting, setGreeting] = React.useState("Good morning");

  React.useEffect(() => {
    const now = new Date();
    setDateLabel(dateFormatter.format(now));
    setGreeting(greetingFor(now.getHours()));
  }, []);

  const firstName = CURRENT_USER.name.split(" ")[0];

  return (
    <Card className="relative overflow-hidden">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 -right-24 size-72 rounded-full bg-primary-100/70 blur-3xl"
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-28 right-40 size-56 rounded-full bg-accent-100/60 blur-3xl"
      />

      <div className="relative flex flex-wrap items-start justify-between gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {greeting}, {firstName}
          </h1>
          <p className="mt-1.5 text-sm text-neutral-500 sm:text-base">
            Here&apos;s what&apos;s happening at your gym today.
          </p>
          {dateLabel && (
            <p className="mt-3 inline-flex items-center rounded-full border border-border bg-surface-muted px-3 py-1 text-xs font-medium text-neutral-500">
              {dateLabel}
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = QUICK_ACTION_ICONS[action.id] ?? FilePlus;
            return (
              <ButtonLink key={action.id} href={action.href} variant="secondary" size="sm">
                <Icon aria-hidden="true" className="size-4" />
                {action.label}
              </ButtonLink>
            );
          })}
        </div>
      </div>
    </Card>
  );
}
