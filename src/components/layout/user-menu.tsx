"use client";

import { LogOut, Settings, UserRound } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { UserAvatar } from "@/components/ui/user-avatar";
import { CURRENT_USER } from "@/data/mock-org";
import { useToast } from "@/components/ui/toast";

export function UserMenu({ className }: { className?: string }) {
  const { toast } = useToast();

  return (
    <Dropdown
      label="User menu"
      align="end"
      className={className}
      triggerClassName="rounded-lg border border-border bg-surface p-1 shadow-card transition-colors hover:bg-neutral-50"
      items={[
        {
          label: "My Profile",
          icon: UserRound,
          href: "/settings/organization",
        },
        {
          label: "Settings",
          icon: Settings,
          href: "/settings/general",
        },
        {
          label: "Sign out",
          icon: LogOut,
          variant: "danger",
          separator: true,
          onClick: () =>
            toast({
              title: "Sign out",
              description:
                "Authentication arrives in Phase 1 with Supabase Auth.",
              variant: "info",
            }),
        },
      ]}
    >
      <span className="flex items-center gap-2.5">
        <UserAvatar name={CURRENT_USER.name} size="md" />
        <span className="hidden text-left md:block">
          <span className="block text-sm font-medium leading-tight text-ink">
            {CURRENT_USER.name}
          </span>
          <span className="block text-xs leading-tight text-neutral-500">
            {CURRENT_USER.role}
          </span>
        </span>
      </span>
    </Dropdown>
  );
}
