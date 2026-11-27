"use client";

import * as React from "react";

import type { LucideIcon } from "lucide-react";
import {
  CalendarCheck,
  CreditCard,
  Dumbbell,
  FilePlus,
  LineChart,
  Plus,
  Salad,
  ScanLine,
  Target,
  UserPlus,
  Users,
} from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { QUICK_ACTIONS } from "@/data/mock-dashboard";
import { useOrganization } from "@/components/auth/org-provider";
import { cn } from "@/lib/utils";

const QUICK_ACTION_ICONS: Record<string, LucideIcon> = {
  "qa-1": UserPlus,
  "qa-2": FilePlus,
  "qa-3": ScanLine,
  "qa-4": CreditCard,
  "qa-5": Target,
};

/** Permission each quick action requires (UI gating only - RLS enforces). */
const QUICK_ACTION_PERMISSIONS: Record<string, string> = {
  "qa-1": "members.create",
  "qa-2": "billing.create",
  "qa-3": "attendance.view",
  "qa-4": "payments.create",
  "qa-5": "crm.manage",
};

const TRAINER_QUICK_ACTIONS = [
  { label: "Schedule PT", href: "/trainers/pt-sessions/add", icon: CalendarCheck },
  { label: "Create Workout Plan", href: "/fitness/workout-plans/add", icon: Dumbbell },
  { label: "Create Diet Plan", href: "/fitness/diet-plans/add", icon: Salad },
  { label: "Record Progress", href: "/fitness/progress", icon: LineChart },
  { label: "My Members", href: "/members", icon: Users },
];

const MEMBER_QUICK_ACTIONS = [
  { label: "Digital Pass & QR", href: "/dashboard", icon: Target },
  { label: "My Workouts", href: "/fitness/workout-plans", icon: Dumbbell },
  { label: "My Diet Plan", href: "/fitness/diet-plans", icon: Salad },
  { label: "Book PT Session", href: "/trainers/pt-sessions", icon: CalendarCheck },
  { label: "Check-in History", href: "/attendance", icon: CalendarCheck },
];

export function QuickActionMenu({ className }: { className?: string }) {
  const { can, context, hasRole } = useOrganization();
  const [cookiePortal, setCookiePortal] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.split("; ").find((row) => row.startsWith("bsb_portal="));
      if (match) setCookiePortal(decodeURIComponent(match.split("=")[1]));
    }
  }, []);

  const isTrainer = hasRole(["trainer"]) || cookiePortal === "trainer";
  const isMember = hasRole(["member"]) || cookiePortal === "member";

  const items = isTrainer
    ? TRAINER_QUICK_ACTIONS
    : isMember
      ? MEMBER_QUICK_ACTIONS
      : QUICK_ACTIONS.filter(
          (action) =>
            context === null ||
            !QUICK_ACTION_PERMISSIONS[action.id] ||
            can(QUICK_ACTION_PERMISSIONS[action.id]),
        ).map((action) => ({
          label: action.label,
          icon: QUICK_ACTION_ICONS[action.id] ?? FilePlus,
          href: action.href,
        }));

  return (
    <Dropdown
      label="Quick actions"
      align="end"
      chevron={false}
      className={className}
      triggerClassName={cn(
        "inline-flex size-10 items-center justify-center rounded-lg bg-primary-700 text-white shadow-card transition-colors",
        "hover:bg-primary-800 active:bg-primary-900",
      )}
      items={items}
    >
      <Plus aria-hidden="true" className="size-5" />
    </Dropdown>
  );
}
