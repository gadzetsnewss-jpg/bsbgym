"use client";

import { useRouter } from "next/navigation";
import { LogOut, Settings, UserRound } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { UserAvatar } from "@/components/ui/user-avatar";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { useOrganization } from "@/components/auth/org-provider";
import { CURRENT_USER } from "@/data/mock-org";

/**
 * User menu backed by the auth + organization context. In preview mode
 * (no Supabase) it falls back to the Phase 0 mock user.
 */
export function UserMenu({ className }: { className?: string }) {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, signOut } = useAuth();
  const { context, profile, member } = useOrganization();

  const displayName = context
    ? [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "User"
    : CURRENT_USER.name;
  const roleName = context ? (member?.roleName ?? "") : CURRENT_USER.role;

  const handleSignOut = async () => {
    if (!configured) {
      toast({
        title: "Sign out",
        description: "Authentication is not enabled in preview mode.",
        variant: "info",
      });
      return;
    }
    const result = await signOut();
    if (result.error) {
      toast({
        title: "Sign out failed",
        description: result.error.message,
        variant: "error",
      });
      return;
    }
    router.replace("/login");
    router.refresh();
  };

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
          href: "/settings/profile",
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
          onClick: handleSignOut,
        },
      ]}
    >
      <span className="flex items-center gap-2.5">
        <UserAvatar
          name={displayName}
          src={context ? (profile?.avatarUrl ?? undefined) : undefined}
          size="md"
        />
        <span className="hidden text-left md:block">
          <span className="block max-w-32 truncate text-sm font-medium leading-tight text-ink">
            {displayName}
          </span>
          <span className="block text-xs leading-tight text-neutral-500">
            {roleName}
          </span>
        </span>
      </span>
    </Dropdown>
  );
}
