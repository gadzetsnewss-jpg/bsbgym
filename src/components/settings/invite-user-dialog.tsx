"use client";

/**
 * Invite user dialog (Phase 3).
 *
 * Collects email, role and branch access, then calls the `create_invitation`
 * RPC which returns the raw one-time token. In the dev flow the raw token is
 * shown once with a copyable invite link - email delivery is not production
 * ready and is documented as such.
 */

import * as React from "react";
import { Copy, Link2, LoaderCircle, Mail } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { inviteSchema } from "@/lib/validation/auth-schemas";
import { createInvitation, type RoleOption, type OrgBranchOption } from "@/lib/org/members";
import { useToast } from "@/components/ui/toast";

export interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  organizationId: string;
  roles: RoleOption[];
  branches: OrgBranchOption[];
}

interface InviteFormState {
  email: string;
  roleId: string;
  accessAllBranches: boolean;
  branchIds: string[];
}

const initialState: InviteFormState = {
  email: "",
  roleId: "",
  accessAllBranches: true,
  branchIds: [],
};

export function InviteUserDialog({
  open,
  onClose,
  onCreated,
  organizationId,
  roles,
  branches,
}: InviteUserDialogProps) {
  const { toast } = useToast();
  const [form, setForm] = React.useState<InviteFormState>(initialState);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<{ email: string; link: string } | null>(null);

  const reset = React.useCallback(() => {
    setForm(initialState);
    setErrors({});
    setResult(null);
  }, []);

  const handleClose = React.useCallback(() => {
    reset();
    onClose();
  }, [reset, onClose]);

  const toggleBranch = (branchId: string, checked: boolean) => {
    setForm((prev) => ({
      ...prev,
      branchIds: checked
        ? [...prev.branchIds, branchId]
        : prev.branchIds.filter((id) => id !== branchId),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrors({});
    const parsed = inviteSchema.safeParse(form);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as string;
        if (key && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    if (!parsed.data.accessAllBranches && parsed.data.branchIds.length === 0) {
      setErrors({ branchIds: "Select at least one branch." });
      return;
    }

    setSubmitting(true);
    const res = await createInvitation({
      organizationId,
      email: parsed.data.email,
      roleId: parsed.data.roleId,
      branchIds: parsed.data.branchIds,
      accessAllBranches: parsed.data.accessAllBranches,
    });
    setSubmitting(false);

    if (res.error || !res.data) {
      toast({
        title: "Could not create invitation",
        description: res.error?.message ?? "Please try again.",
        variant: "error",
      });
      return;
    }

    const base =
      typeof window !== "undefined" ? `${window.location.origin}` : "";
    setResult({
      email: parsed.data.email,
      link: `${base}/accept-invitation?token=${encodeURIComponent(res.data.token)}`,
    });
    onCreated();
    toast({
      title: "Invitation created",
      description: `Invite sent to ${parsed.data.email}.`,
      variant: "success",
    });
  };

  const copyLink = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.link);
      toast({ title: "Invite link copied", variant: "success" });
    } catch {
      toast({
        title: "Could not copy link",
        description: "Copy the link manually.",
        variant: "warning",
      });
    }
  };

  const roleOptions = roles.map((role) => ({
    value: role.id,
    label: role.name,
  }));

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title={result ? "Invitation ready" : "Invite a team member"}
      description={
        result
          ? "This link expires after 7 days."
          : "They will get access to this gym organization."
      }
      size="md"
      footer={
        result ? (
          <Button onClick={handleClose}>Done</Button>
        ) : (
          <>
            <Button variant="outline" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="invite-user-form"
              onClick={undefined}
              isLoading={submitting}
            >
              {!submitting && <Mail aria-hidden="true" className="size-4" />}
              Send invitation
            </Button>
          </>
        )
      }
    >
      {result ? (
        <div className="space-y-4">
          <p className="text-sm text-neutral-600">
            Copy this invite link and share it with{" "}
            <span className="font-medium text-ink">{result.email}</span>. Opening
            it will finish the sign-up and grant them access.
          </p>
          <div className="flex items-center gap-2 rounded-lg border border-border bg-surface-muted p-2">
            <Link2 aria-hidden="true" className="size-4 shrink-0 text-neutral-400" />
            <code className="min-w-0 flex-1 truncate text-xs text-ink">
              {result.link}
            </code>
            <Button variant="outline" size="sm" onClick={copyLink}>
              <Copy aria-hidden="true" className="size-3.5" />
              Copy
            </Button>
          </div>
          <p className="text-xs text-neutral-500">
            For security the raw token is only shown this once and is stored hashed
            (SHA-256) in the database. Email delivery is not wired up yet, so the
            link is copied manually during development.
          </p>
        </div>
      ) : (
        <form id="invite-user-form" onSubmit={handleSubmit} noValidate className="space-y-4">
          <FormField
            label="Email address"
            required
            error={errors.email}
            hint="Must match the address they use to sign in."
          >
            <Input
              type="email"
              autoComplete="email"
              placeholder="trainer@example.com"
              value={form.email}
              invalid={Boolean(errors.email)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, email: event.target.value }))
              }
            />
          </FormField>

          <FormField
            label="Role"
            required
            error={errors.roleId}
            hint="Determines what this member can see and do."
          >
            <Select
              options={roleOptions}
              placeholder="Select a role"
              value={form.roleId}
              invalid={Boolean(errors.roleId)}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, roleId: event.target.value }))
              }
            />
          </FormField>

          <fieldset className="space-y-3">
            <legend className="text-sm font-medium text-ink">Branch access</legend>
            <div className="space-y-2">
              <label className="flex items-center gap-2 text-sm text-neutral-700">
                <Checkbox
                  checked={form.accessAllBranches}
                  onChange={(event) =>
                    setForm((prev) => ({
                      ...prev,
                      accessAllBranches: event.target.checked,
                      branchIds: event.target.checked ? [] : prev.branchIds,
                    }))
                  }
                />
                All branches
              </label>
              {!form.accessAllBranches && (
                <div className="space-y-2 pl-6">
                  {branches.length === 0 ? (
                    <p className="text-xs text-neutral-500">No branches yet.</p>
                  ) : (
                    branches.map((branch) => (
                      <label
                        key={branch.id}
                        className="flex items-center gap-2 text-sm text-neutral-700"
                      >
                        <Checkbox
                          checked={form.branchIds.includes(branch.id)}
                          onChange={(event) =>
                            toggleBranch(branch.id, event.target.checked)
                          }
                        />
                        {branch.name}
                        <span className="text-xs text-neutral-400">({branch.code})</span>
                      </label>
                    ))
                  )}
                  {errors.branchIds && (
                    <p role="alert" className="text-xs font-medium text-red-600">
                      {errors.branchIds}
                    </p>
                  )}
                </div>
              )}
            </div>
          </fieldset>
        </form>
      )}

      {submitting && (
        <div className="flex items-center gap-2 text-xs text-neutral-500">
          <LoaderCircle className="size-3.5 animate-spin" aria-hidden="true" />
          Creating invitation…
        </div>
      )}
    </Modal>
  );
}
