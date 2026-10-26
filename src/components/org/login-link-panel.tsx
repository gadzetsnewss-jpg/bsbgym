"use client";

import * as React from "react";
import { Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchOrgMembers, type OrgMemberRow } from "@/lib/org/members";
import {
  linkGymMemberUser,
  linkTrainerUser,
  unlinkGymMemberUser,
  unlinkTrainerUser,
} from "@/lib/org/gym-members";
import { displayName } from "@/lib/format";

export function TrainerLoginLinkPanel({
  trainerId,
  linkedUserId,
  onChanged,
}: {
  trainerId: string;
  linkedUserId: string | null;
  onChanged?: () => void;
}) {
  return (
    <LoginLinkPanel
      kind="trainer"
      recordId={trainerId}
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

function LoginLinkPanel({
  kind,
  recordId,
  linkedUserId,
  onChanged,
}: {
  kind: "trainer" | "member";
  recordId: string;
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
    onChanged?.();
  };

  return (
    <Card className="space-y-3">
      <h3 className="text-sm font-semibold text-ink">Login</h3>
      {linkedUserId ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-neutral-600">
            Linked to {linkedLabel ?? "a user"}. After they sign in they only see their own rows.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleUnlink()}
            disabled={saving}
          >
            <Unlink aria-hidden="true" className="size-4" />
            Unlink
          </Button>
        </div>
      ) : options.length === 0 ? (
        <EmptyState
          icon={Link2}
          title={kind === "trainer" ? "No trainer logins" : "No member logins"}
          description="Invite a user with this role from Settings > Users & roles, then link them here."
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
    </Card>
  );
}
