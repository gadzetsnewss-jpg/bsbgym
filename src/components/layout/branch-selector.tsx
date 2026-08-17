"use client";

import * as React from "react";
import { Check, Store } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { ORG_BRANCHES, DEFAULT_BRANCH_ID } from "@/data/mock-org";

/**
 * Branch selector backed by the organization context. Only branches the
 * current member is authorized for are listed. Branch selection is a UI
 * preference, not a security boundary - RLS enforces branch access.
 */
export function BranchSelector({ className }: { className?: string }) {
  const { toast } = useToast();
  const { context, branches, currentBranch, setBranch } = useOrganization();

  // Preview fallback (no Supabase): show the Phase 0 mock branches.
  const [previewId, setPreviewId] = React.useState(DEFAULT_BRANCH_ID);

  if (!context) {
    const previewBranch = ORG_BRANCHES.find((branch) => branch.id === previewId);
    return (
      <Dropdown
        label="Switch branch"
        align="end"
        className={className}
        triggerClassName="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card transition-colors hover:bg-neutral-50 md:inline-flex"
        items={ORG_BRANCHES.map((branch) => ({
          label: `${branch.name} · ${branch.city}`,
          icon: branch.id === previewId ? Check : undefined,
          onClick: () => {
            setPreviewId(branch.id);
            toast({
              title: "Branch switched",
              description: `${branch.name} is now the active branch.`,
              variant: "info",
            });
          },
        }))}
      >
        <Store aria-hidden="true" className="size-4 text-primary-700" />
        <span className="max-w-40 truncate font-medium text-ink">
          {previewBranch?.name ?? "Select branch"}
        </span>
      </Dropdown>
    );
  }

  if (branches.length <= 1) return null;

  return (
    <Dropdown
      label="Switch branch"
      items={branches.map((branch) => ({
        label: `${branch.name}${branch.city ? ` · ${branch.city}` : ""}`,
        icon: branch.id === currentBranch?.id ? Check : undefined,
        onClick: () => {
          setBranch(branch.id);
          toast({
            title: "Branch switched",
            description: `${branch.name} is now the active branch.`,
            variant: "info",
          });
        },
      }))}
      align="end"
      className={className}
      triggerClassName="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card transition-colors hover:bg-neutral-50 md:inline-flex"
    >
      <Store aria-hidden="true" className="size-4 text-primary-700" />
      <span className="max-w-40 truncate font-medium text-ink">
        {currentBranch?.name ?? "Select branch"}
      </span>
    </Dropdown>
  );
}
