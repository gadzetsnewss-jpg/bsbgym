"use client";

import * as React from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormField } from "@/components/ui/form-field";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { PasswordInput } from "@/components/auth/password-input";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchOrgMembers, type OrgMemberRow } from "@/lib/org/members";
import {
  linkGymMemberUser,
  linkTrainerUser,
  provisionLinkedLogin,
  resetLinkedLoginPassword,
  unlinkGymMemberUser,
  unlinkTrainerUser,
} from "@/lib/org/gym-members";
import { displayName } from "@/lib/format";
import { ownerSetLoginPasswordSchema } from "@/lib/validation/auth-schemas";

type PasswordValues = { password: string; confirmPassword: string };

function emptyPasswords(): PasswordValues {
  return { password: "", confirmPassword: "" };
}

export function TrainerLoginLinkPanel({
  trainerId,
  trainerName,
  trainerCode,
  linkedUserId,
  onChanged,
}: {
  trainerId: string;
  trainerName: string;
  trainerCode: string | null;
  linkedUserId: string | null;
  onChanged?: () => void;
}) {
  return (
    <LoginLinkPanel
      kind="trainer"
      recordId={trainerId}
      displayName={trainerName}
      loginId={trainerCode}
      linkedUserId={linkedUserId}
      onChanged={onChanged}
    />
  );
}

export function MemberLoginLinkPanel({
  memberId,
  linkedUserId,
  onChanged,
}: {
  memberId: string;
  linkedUserId: string | null;
  onChanged?: () => void;
}) {
  return (
    <LoginLinkPanel
      kind="member"
      recordId={memberId}
      linkedUserId={linkedUserId}
      onChanged={onChanged}
    />
  );
}

function LoginPasswordForm({
  kind,
  displayLabel,
  loginId,
  submitLabel,
  saving,
  onSubmit,
  onCancel,
}: {
  kind: "trainer" | "member";
  displayLabel: string;
  loginId: string;
  submitLabel: string;
  saving: boolean;
  onSubmit: (values: PasswordValues) => Promise<void>;
  onCancel?: () => void;
}) {
  const [values, setValues] = React.useState<PasswordValues>(emptyPasswords);
  const [errors, setErrors] = React.useState<Partial<Record<keyof PasswordValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  const setField = (field: keyof PasswordValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    const parsed = ownerSetLoginPasswordSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof PasswordValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PasswordValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }
    setFormError(null);
    try {
      await onSubmit(parsed.data);
      setValues(emptyPasswords());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Something went wrong. Please try again.");
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      <FormField label={kind === "trainer" ? "Trainer Name" : "Member Name"}>
        <Input value={displayLabel} readOnly disabled />
      </FormField>
      <FormField
        label={kind === "trainer" ? "Trainer ID" : "Member ID"}
        hint="This ID is used at the login portal."
      >
        <Input value={loginId} readOnly disabled />
      </FormField>
      <FormField
        label="Set Password"
        required
        hint="At least 8 characters with letters and numbers."
        error={errors.password}
      >
        <PasswordInput
          autoComplete="new-password"
          placeholder="Enter a password"
          invalid={Boolean(errors.password)}
          value={values.password}
          onChange={(event) => setField("password", event.target.value)}
          disabled={saving}
        />
      </FormField>
      <FormField label="Confirm Password" required error={errors.confirmPassword}>
        <PasswordInput
          autoComplete="new-password"
          placeholder="Re-enter the password"
          invalid={Boolean(errors.confirmPassword)}
          value={values.confirmPassword}
          onChange={(event) => setField("confirmPassword", event.target.value)}
          disabled={saving}
        />
      </FormField>
      {formError && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="sm" isLoading={saving} disabled={saving || !loginId}>
          {submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

function LoginLinkPanel({
  kind,
  recordId,
  displayName: recordDisplayName,
  loginId,
  linkedUserId,
  onChanged,
}: {
  kind: "trainer" | "member";
  recordId: string;
  displayName?: string;
  loginId?: string | null;
  linkedUserId: string | null;
  onChanged?: () => void;
}) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("users.manage");

  const [members, setMembers] = React.useState<OrgMemberRow[]>([]);
  const [userId, setUserId] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [localLinked, setLocalLinked] = React.useState<boolean | null>(null);
  const [showResetForm, setShowResetForm] = React.useState(false);

  React.useEffect(() => {
    setLocalLinked(null);
    setShowResetForm(false);
  }, [linkedUserId]);

  const load = React.useCallback(async () => {
    if (!orgId || !canManage) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchOrgMembers(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setMembers(result.data);
  }, [orgId, canManage]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canManage) return null;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading logins…" />;

  const roleSlug = kind === "trainer" ? "trainer" : "member";
  const options = members
    .filter((row) => row.status === "active" && row.roleSlug === roleSlug)
    .map((row) => ({
      value: row.userId,
      label: displayName({
        firstName: row.firstName,
        lastName: row.lastName,
        fallback: row.email,
      }),
    }));
  const linked = members.find((row) => row.userId === linkedUserId);
  const linkedLabel = linked
    ? displayName({
        firstName: linked.firstName,
        lastName: linked.lastName,
        fallback: linked.email,
      })
    : null;

  const handleLink = async () => {
    if (!userId) return;
    setSaving(true);
    const result =
      kind === "trainer"
        ? await linkTrainerUser(recordId, userId)
        : await linkGymMemberUser(recordId, userId);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not link login", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Login linked", variant: "success" });
    setUserId("");
    setLocalLinked(true);
    onChanged?.();
  };

  const handleUnlink = async () => {
    setSaving(true);
    const result =
      kind === "trainer" ? await unlinkTrainerUser(recordId) : await unlinkGymMemberUser(recordId);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not unlink login", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Login unlinked", variant: "success" });
    setLocalLinked(false);
    setShowResetForm(false);
    onChanged?.();
  };

  const handleProvisionWithPassword = async (values: PasswordValues) => {
    setSaving(true);
    const result = await provisionLinkedLogin(kind, recordId, values);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not create login", description: result.error.message, variant: "error" });
      throw new Error(result.error.message);
    }
    toast({
      title: "Login created",
      description:
        kind === "member"
          ? `Sign in at /member/login with ${result.data.loginId}.`
          : `Sign in at /trainer/login with ${result.data.loginId}.`,
      variant: "success",
    });
    setLocalLinked(true);
    onChanged?.();
  };

  const handleProvisionDefault = async () => {
    setSaving(true);
    const result = await provisionLinkedLogin(kind, recordId);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not create login", description: result.error.message, variant: "error" });
      return;
    }
    toast({
      title: "Login created",
      description:
        kind === "member"
          ? `Sign in at /member/login with ${result.data.loginId}. The initial password is the registered mobile number.`
          : `Sign in at /trainer/login with ${result.data.loginId}. The initial password is the registered mobile number.`,
      variant: "success",
    });
    setLocalLinked(true);
    onChanged?.();
  };

  const handleResetPassword = async (values: PasswordValues) => {
    setSaving(true);
    const result = await resetLinkedLoginPassword(
      kind,
      recordId,
      values.password,
      values.confirmPassword,
    );
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not update password", description: result.error.message, variant: "error" });
      throw new Error(result.error.message);
    }
    toast({
      title: "Password updated",
      description:
        kind === "trainer"
          ? "The trainer can now sign in at /trainer/login with this password."
          : "The member can now sign in at /member/login with this password.",
      variant: "success",
    });
    setShowResetForm(false);
  };

  const isLinked = localLinked ?? Boolean(linkedUserId);
  const resolvedLoginId = (loginId ?? "").trim().toUpperCase();
  const resolvedName = recordDisplayName?.trim() || (kind === "trainer" ? "Trainer" : "Member");
  const title = kind === "trainer" ? "Login Access" : "Login";

  return (
    <Card className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-ink">{title}</h3>
        {kind === "trainer" && (
          <Badge tone={isLinked ? "success" : "warning"} withDot>
            {isLinked ? "Login Active" : "Login Not Created"}
          </Badge>
        )}
      </div>

      {isLinked ? (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              {kind === "trainer"
                ? `Login is active${resolvedLoginId ? ` for ${resolvedLoginId}` : ""}. After they sign in they only see their own rows.`
                : `Linked to ${linkedLabel ?? "a user"}. After they sign in they only see their own rows.`}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {kind === "trainer" && !showResetForm && (
                <Button size="sm" onClick={() => setShowResetForm(true)} disabled={saving}>
                  Reset Password
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={() => void handleUnlink()} disabled={saving}>
                <Unlink aria-hidden="true" className="size-4" />
                Unlink
              </Button>
            </div>
          </div>
          {kind === "trainer" && showResetForm && (
            <LoginPasswordForm
              kind={kind}
              displayLabel={resolvedName}
              loginId={resolvedLoginId || "—"}
              submitLabel="Update Password"
              saving={saving}
              onSubmit={handleResetPassword}
              onCancel={() => setShowResetForm(false)}
            />
          )}
        </div>
      ) : kind === "trainer" ? (
        <div className="space-y-4">
          {resolvedLoginId ? (
            <LoginPasswordForm
              kind={kind}
              displayLabel={resolvedName}
              loginId={resolvedLoginId}
              submitLabel="Create Trainer Login"
              saving={saving}
              onSubmit={handleProvisionWithPassword}
            />
          ) : (
            <p className="text-sm text-neutral-600">
              Add a trainer code before creating a login. The trainer uses that code as their ID at /trainer/login.
            </p>
          )}
          {options.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No invited trainer logins"
              description="Invite a user with this role from Settings > Users & roles to link an existing login, or create one above."
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Select
                  options={options}
                  placeholder="Select a login"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                />
              </div>
              <Button size="sm" onClick={() => void handleLink()} disabled={!userId || saving}>
                <Link2 aria-hidden="true" className="size-4" />
                Link login
              </Button>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-neutral-600">
              Create a member login. The ID is the member code. The initial password is the registered mobile number.
            </p>
            <Button size="sm" onClick={() => void handleProvisionDefault()} disabled={saving}>
              Create login
            </Button>
          </div>
          {options.length === 0 ? (
            <EmptyState
              icon={Link2}
              title="No invited member logins"
              description="Invite a user with this role from Settings > Users & roles to link an existing login, or create one above."
            />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <div className="min-w-56 flex-1">
                <Select
                  options={options}
                  placeholder="Select a login"
                  value={userId}
                  onChange={(event) => setUserId(event.target.value)}
                />
              </div>
              <Button size="sm" onClick={() => void handleLink()} disabled={!userId || saving}>
                <Link2 aria-hidden="true" className="size-4" />
                Link login
              </Button>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
