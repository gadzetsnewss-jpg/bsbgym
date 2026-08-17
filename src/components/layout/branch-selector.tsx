"use client";

import * as React from "react";
import { Check, Store } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { ORG_BRANCHES, DEFAULT_BRANCH_ID, type Branch } from "@/data/mock-org";
import { useToast } from "@/components/ui/toast";

export function BranchSelector({ className }: { className?: string }) {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = React.useState<string>(DEFAULT_BRANCH_ID);
  const selected = ORG_BRANCHES.find((branch) => branch.id === selectedId);

  const items = ORG_BRANCHES.map((branch: Branch) => ({
    label: `${branch.name} · ${branch.city}`,
    icon: branch.id === selectedId ? Check : undefined,
    onClick: () => {
      setSelectedId(branch.id);
      toast({
        title: "Branch switched",
        description: `${branch.name} is now the active branch.`,
        variant: "info",
      });
    },
  }));

  return (
    <Dropdown
      label="Switch branch"
      items={items}
      align="end"
      className={className}
      triggerClassName="hidden items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm shadow-card transition-colors hover:bg-neutral-50 md:inline-flex"
    >
      <Store aria-hidden="true" className="size-4 text-primary-700" />
      <span className="max-w-40 truncate font-medium text-ink">
        {selected?.name ?? "Select branch"}
      </span>
    </Dropdown>
  );
}
