"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { StatusBadge } from "@/components/ui/badge";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { setPtSessionStatus } from "@/lib/org/gym-members";
import type { PtSessionRow } from "@/lib/operations/adapters";
import { PT_SESSION_STATUSES } from "@/lib/validation/operations-schemas";

const STATUS_ACTIONS = PT_SESSION_STATUSES.filter((status) => status.value !== "scheduled");

function humanLabel(value: string) {
  return (
    PT_SESSION_STATUSES.find((status) => status.value === value)?.label ??
    value.replace(/[_-]+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase())
  );
}

export function ptSessionDetailExtras(row: PtSessionRow) {
  return <PtSessionStatusActions row={row} />;
}

function PtSessionStatusActions({ row }: { row: PtSessionRow }) {
  const router = useRouter();
  const { toast } = useToast();
  const { can, hasRole } = useOrganization();
  const canSetStatus = can("trainers.edit") || hasRole(["trainer"]);

  const [pending, setPending] = React.useState<(typeof STATUS_ACTIONS)[number] | null>(null);
  const [saving, setSaving] = React.useState(false);

  if (!canSetStatus) return null;

  const confirm = async () => {
    if (!pending) return;
    setSaving(true);
    const result = await setPtSessionStatus(row.id, pending.value);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not update session", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: `Session marked ${pending.label.toLowerCase()}`, variant: "success" });
    setPending(null);
    router.refresh();
  };

  return (
    <Card className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Session status</h2>
          <p className="mt-0.5 text-sm text-neutral-500">
            Linked trainers can complete, cancel, or mark no-show on their own sessions.
          </p>
        </div>
        <StatusBadge status={humanLabel(row.status)} />
      </div>
      {row.status === "scheduled" ? (
        <div className="flex flex-wrap items-center gap-2">
          {STATUS_ACTIONS.map((status) => (
            <Button
              key={status.value}
              variant={status.value === "completed" ? "primary" : "outline"}
              size="sm"
              onClick={() => setPending(status)}
            >
              Mark {status.label.toLowerCase()}
            </Button>
          ))}
        </div>
      ) : (
        <p className="text-sm text-neutral-500">This session is no longer scheduled.</p>
      )}
      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirm()}
        title={pending ? `Mark ${pending.label.toLowerCase()}` : ""}
        description={
          pending
            ? `This personal training session for ${row.memberName} will be marked ${pending.label.toLowerCase()}.`
            : ""
        }
        confirmLabel={pending ? pending.label : "Confirm"}
        tone={pending?.value === "completed" ? "primary" : "danger"}
        isLoading={saving}
      />
    </Card>
  );
}
