"use client";

/**
 * Users & Roles page (Phase 3).
 *
 * Shows org members and pending invitations with management actions
 * (change role, branch access, deactivate/reactivate, revoke invite). All
 * mutations go through the SECURITY DEFINER RPCs; RLS is the final layer.
 */

import * as React from "react";
import {
  Pencil,
  RotateCcw,
  UserMinus,
  UserPlus,
  UserRoundCog,
  Users,
  X,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RowActions } from "@/components/ui/row-actions";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { Tabs } from "@/components/ui/tabs";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { InviteUserDialog } from "@/components/settings/invite-user-dialog";
import {
  fetchOrgMembers,
  fetchOrgRoles,
  fetchOrgBranches,
  fetchInvitations,
  updateMemberRole,
  updateMemberBranchAccess,
  setMemberStatus,
  revokeInvitation,
  type OrgMemberRow,
  type InvitationRow,
  type RoleOption,
  type OrgBranchOption,
} from "@/lib/org/members";
import { USER_STATUS_LABELS, INVITATION_STATUS_LABELS } from "@/lib/auth/permissions";

const STATUS_LABEL: Record<string, string> = { ...USER_STATUS_LABELS, ...INVITATION_STATUS_LABELS };

function memberDisplayName(member: OrgMemberRow): string {
  const name = [member.firstName, member.lastName].filter(Boolean).join(" ");
  return name.trim() || (member.email ?? "Unnamed member");
}

function isPendingInvite(invite: InvitationRow): boolean {
  return invite.status === "pending";
}

export default function UsersRolesPanel() {
  const { organization, member: currentMember, can, isOwner } = useOrganization();
  const { toast } = useToast();

  const orgId = organization?.id;

  const [tab, setTab] = React.useState("members");
  const [members, setMembers] = React.useState<OrgMemberRow[]>([]);
  const [invitations, setInvitations] = React.useState<InvitationRow[]>([]);
  const [roles, setRoles] = React.useState<RoleOption[]>([]);
  const [branches, setBranches] = React.useState<OrgBranchOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const [editingMember, setEditingMember] = React.useState<OrgMemberRow | null>(null);
  const [editRoleId, setEditRoleId] = React.useState("");
  const [savingRole, setSavingRole] = React.useState(false);

  const [accessMember, setAccessMember] = React.useState<OrgMemberRow | null>(null);
  const [accessAll, setAccessAll] = React.useState(true);
  const [accessBranchIds, setAccessBranchIds] = React.useState<string[]>([]);
  const [savingAccess, setSavingAccess] = React.useState(false);

  const [statusMember, setStatusMember] = React.useState<OrgMemberRow | null>(null);
  const [statusAction, setStatusAction] = React.useState<"suspend" | "reactivate">("suspend");
  const [savingStatus, setSavingStatus] = React.useState(false);

  const [revokingInvite, setRevokingInvite] = React.useState<InvitationRow | null>(null);
  const [savingRevoke, setSavingRevoke] = React.useState(false);

  const canManageUsers = can("users.manage");
  const canInvite = can("invites.send");

  const activeRoles = roles.filter((role) => role.isActive);
  const assignableRoles = activeRoles.filter((role) => role.slug !== "owner");

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [membersRes, invitesRes, rolesRes, branchesRes] = await Promise.all([
      fetchOrgMembers(orgId),
      fetchInvitations(orgId),
      fetchOrgRoles(orgId),
      fetchOrgBranches(orgId),
    ]);
    setLoading(false);

    const firstError =
      membersRes.error ?? invitesRes.error ?? rolesRes.error ?? branchesRes.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    if (membersRes.data) setMembers(membersRes.data);
    if (invitesRes.data) setInvitations(invitesRes.data);
    if (rolesRes.data) setRoles(rolesRes.data);
    if (branchesRes.data) setBranches(branchesRes.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const isSelf = (row: OrgMemberRow) => row.userId === currentMember?.userId;
  const isOwnerRow = (row: OrgMemberRow) => row.roleSlug === "owner";

  const openRoleEditor = (row: OrgMemberRow) => {
    setEditingMember(row);
    setEditRoleId(row.roleId);
  };

  const saveRole = async () => {
    if (!editingMember) return;
    if (editRoleId === editingMember.roleId) {
      setEditingMember(null);
      return;
    }
    setSavingRole(true);
    const res = await updateMemberRole(editingMember.id, editRoleId);
    setSavingRole(false);
    if (res.error) {
      toast({ title: "Could not update role", description: res.error.message, variant: "error" });
      return;
    }
    toast({ title: "Role updated", variant: "success" });
    setEditingMember(null);
    void load();
  };

  const openAccessEditor = (row: OrgMemberRow) => {
    setAccessMember(row);
    setAccessAll(row.accessAllBranches);
    setAccessBranchIds([]);
  };

  const toggleAccessBranch = (branchId: string, checked: boolean) => {
    setAccessBranchIds((prev) =>
      checked ? [...prev, branchId] : prev.filter((id) => id !== branchId),
    );
  };

  const saveAccess = async () => {
    if (!accessMember) return;
    if (!accessAll && accessBranchIds.length === 0) {
      toast({
        title: "Select at least one branch",
        description: "Or grant access to all branches.",
        variant: "warning",
      });
      return;
    }
    setSavingAccess(true);
    const res = await updateMemberBranchAccess(accessMember.id, accessBranchIds, accessAll);
    setSavingAccess(false);
    if (res.error) {
      toast({ title: "Could not update access", description: res.error.message, variant: "error" });
      return;
    }
    toast({ title: "Branch access updated", variant: "success" });
    setAccessMember(null);
    void load();
  };

  const openStatusConfirm = (row: OrgMemberRow, action: "suspend" | "reactivate") => {
    setStatusMember(row);
    setStatusAction(action);
  };

  const confirmStatus = async () => {
    if (!statusMember) return;
    const nextStatus = statusAction === "suspend" ? "suspended" : "active";
    setSavingStatus(true);
    const res = await setMemberStatus(statusMember.id, nextStatus);
    setSavingStatus(false);
    if (res.error) {
      toast({ title: "Could not update status", description: res.error.message, variant: "error" });
      return;
    }
    toast({
      title: statusAction === "suspend" ? "Member suspended" : "Member reactivated",
      variant: "success",
    });
    setStatusMember(null);
    void load();
  };

  const confirmRevoke = async () => {
    if (!revokingInvite) return;
    setSavingRevoke(true);
    const res = await revokeInvitation(revokingInvite.id);
    setSavingRevoke(false);
    if (res.error) {
      toast({ title: "Could not revoke invite", description: res.error.message, variant: "error" });
      return;
    }
    toast({ title: "Invitation revoked", variant: "success" });
    setRevokingInvite(null);
    void load();
  };

  const memberColumns: Column<OrgMemberRow>[] = [
    {
      id: "user",
      header: "Member",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={memberDisplayName(row)} src={row.avatarUrl ?? undefined} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{memberDisplayName(row)}</p>
            {isSelf(row) && <span className="text-xs text-neutral-400">You</span>}
          </div>
        </div>
      ),
      sortValue: (row) => memberDisplayName(row).toLowerCase(),
    },
    {
      id: "email",
      header: "Email",
      cell: (row) => (
        <span className="text-sm text-neutral-600">{row.email ?? "—"}</span>
      ),
      sortValue: (row) => row.email?.toLowerCase() ?? "",
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => <Badge tone="neutral">{row.roleName}</Badge>,
      sortValue: (row) => row.roleName.toLowerCase(),
    },
    {
      id: "branches",
      header: "Branch access",
      cell: (row) => (
        <span className="text-sm text-neutral-600">
          {row.accessAllBranches
            ? "All branches"
            : row.branchNames.length > 0
              ? row.branchNames.join(", ")
              : "No branches"}
        </span>
      ),
      sortValue: (row) =>
        row.accessAllBranches ? "~all" : row.branchNames.join(", ").toLowerCase(),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={STATUS_LABEL[row.status] ?? row.status} />
      ),
      sortValue: (row) => row.status,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        if (!canManageUsers) return null;
        const ownerProtected = isOwnerRow(row);
        const self = isSelf(row);
        const isOwnerSelf = isOwner && self;
        const canDeactivate = !ownerProtected && !isOwnerSelf && row.status === "active";
        const canReactivate = row.status === "suspended" || row.status === "deactivated";

        return (
          <RowActions
            label={`Actions for ${memberDisplayName(row)}`}
            items={[
              {
                label: "Change role",
                icon: UserRoundCog,
                onClick: () => openRoleEditor(row),
                disabled: ownerProtected && !isOwner,
              },
              {
                label: "Branch access",
                icon: Pencil,
                onClick: () => openAccessEditor(row),
              },
              ...(canDeactivate
                ? [
                    {
                      label: "Suspend",
                      icon: UserMinus,
                      variant: "danger" as const,
                      onClick: () => openStatusConfirm(row, "suspend"),
                    },
                  ]
                : []),
              ...(canReactivate
                ? [
                    {
                      label: "Reactivate",
                      icon: RotateCcw,
                      onClick: () => openStatusConfirm(row, "reactivate"),
                    },
                  ]
                : []),
            ]}
          />
        );
      },
    },
  ];

  const inviteColumns: Column<InvitationRow>[] = [
    {
      id: "email",
      header: "Email",
      cell: (row) => <span className="font-medium text-ink">{row.email}</span>,
      sortValue: (row) => row.email.toLowerCase(),
    },
    {
      id: "role",
      header: "Role",
      cell: (row) => <Badge tone="neutral">{row.roleName}</Badge>,
    },
    {
      id: "branches",
      header: "Branch access",
      cell: (row) => (
        <span className="text-sm text-neutral-600">
          {row.accessAllBranches
            ? "All branches"
            : row.branchNames.length > 0
              ? row.branchNames.join(", ")
              : "No branches"}
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={STATUS_LABEL[row.status] ?? row.status} />,
      sortValue: (row) => row.status,
    },
    {
      id: "expires",
      header: "Expires",
      cell: (row) => {
        if (row.status === "expired" || row.status === "accepted" || row.status === "revoked") {
          return <span className="text-sm text-neutral-400">—</span>;
        }
        const date = new Date(row.expiresAt);
        if (Number.isNaN(date.getTime())) return <span className="text-sm text-neutral-400">—</span>;
        return (
          <span className="text-sm text-neutral-600">
            {date.toLocaleDateString()}
          </span>
        );
      },
      sortValue: (row) => row.expiresAt,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        if (!canInvite || !isPendingInvite(row)) return null;
        return (
          <RowActions
            label={`Actions for invitation to ${row.email}`}
            items={[
              {
                label: "Revoke",
                icon: X,
                variant: "danger",
                onClick: () => setRevokingInvite(row),
              },
            ]}
          />
        );
      },
    },
  ];

  const pendingCount = invitations.filter(isPendingInvite).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Users & Roles"
        description="Manage team members, their roles and branch access."
        actions={
          canInvite ? (
            <Button onClick={() => setInviteOpen(true)}>
              <UserPlus aria-hidden="true" className="size-4" />
              Invite member
            </Button>
          ) : undefined
        }
      />

      {!canManageUsers && !canInvite ? (
        <Card className="p-6">
          <EmptyState
            title="You don't have access"
            description="Your current role cannot manage users or roles."
            icon={Users}
          />
        </Card>
      ) : (
        <>
          {error ? (
            <ErrorState
              title="Could not load team data"
              description={error}
              onRetry={() => void load()}
            />
          ) : loading ? (
            <LoadingState label="Loading team data…" />
          ) : (
            <Tabs
              aria-label="Users and invitations"
              value={tab}
              onValueChange={setTab}
              items={[
                { value: "members", label: "Members", icon: Users, badge: members.length },
                { value: "invites", label: "Invitations", icon: UserPlus, badge: pendingCount },
              ]}
            >
              {tab === "members" ? (
                <DataTable
                  columns={memberColumns}
                  data={members}
                  rowKey={(row) => row.id}
                  emptyTitle="No members yet"
                  emptyDescription="Invite your first team member to get started."
                />
              ) : (
                <DataTable
                  columns={inviteColumns}
                  data={invitations}
                  rowKey={(row) => row.id}
                  emptyTitle="No invitations"
                  emptyDescription="Invite a teammate to join this organization."
                />
              )}
            </Tabs>
          )}
        </>
      )}

      {canInvite && orgId && (
        <InviteUserDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          onCreated={() => void load()}
          organizationId={orgId}
          roles={assignableRoles}
          branches={branches}
        />
      )}

      {/* Change role dialog */}
      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title="Change role"
        description={
          editingMember
            ? `Update the role for ${memberDisplayName(editingMember)}.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditingMember(null)} disabled={savingRole}>
              Cancel
            </Button>
            <Button onClick={() => void saveRole()} isLoading={savingRole}>
              Save
            </Button>
          </>
        }
      >
        {editingMember && (
          <FormField
            label="Role"
            hint="This determines what the member can see and do."
          >
            <Select
              options={assignableRoles.map((role) => ({ value: role.id, label: role.name }))}
              value={editRoleId}
              onChange={(event) => setEditRoleId(event.target.value)}
            />
          </FormField>
        )}
      </Modal>

      {/* Branch access dialog */}
      <Modal
        open={Boolean(accessMember)}
        onClose={() => setAccessMember(null)}
        title="Branch access"
        description={
          accessMember
            ? `Choose which branches ${memberDisplayName(accessMember)} can access.`
            : undefined
        }
        size="sm"
        footer={
          <>
            <Button variant="outline" onClick={() => setAccessMember(null)} disabled={savingAccess}>
              Cancel
            </Button>
            <Button onClick={() => void saveAccess()} isLoading={savingAccess}>
              Save
            </Button>
          </>
        }
      >
        {accessMember && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 text-sm text-neutral-700">
              <Checkbox
                checked={accessAll}
                onChange={(event) =>
                  setAccessAll(event.target.checked)
                }
              />
              All branches
            </label>
            {!accessAll && (
              <div className="space-y-2">
                {branches.length === 0 ? (
                  <p className="text-xs text-neutral-500">No branches yet.</p>
                ) : (
                  branches.map((branch) => (
                    <label
                      key={branch.id}
                      className="flex items-center gap-2 text-sm text-neutral-700"
                    >
                      <Checkbox
                        checked={accessBranchIds.includes(branch.id)}
                        onChange={(event) =>
                          toggleAccessBranch(branch.id, event.target.checked)
                        }
                      />
                      {branch.name}
                      <span className="text-xs text-neutral-400">({branch.code})</span>
                    </label>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Suspend / reactivate confirm */}
      <ConfirmDialog
        open={Boolean(statusMember)}
        onClose={() => setStatusMember(null)}
        onConfirm={() => void confirmStatus()}
        title={statusAction === "suspend" ? "Suspend member" : "Reactivate member"}
        description={
          statusMember
            ? statusAction === "suspend"
              ? `${memberDisplayName(statusMember)} will lose access to this organization until reactivated.`
              : `${memberDisplayName(statusMember)} will regain access to this organization.`
            : ""
        }
        confirmLabel={statusAction === "suspend" ? "Suspend" : "Reactivate"}
        tone={statusAction === "suspend" ? "danger" : "primary"}
        isLoading={savingStatus}
      />

      {/* Revoke invite confirm */}
      <ConfirmDialog
        open={Boolean(revokingInvite)}
        onClose={() => setRevokingInvite(null)}
        onConfirm={() => void confirmRevoke()}
        title="Revoke invitation"
        description={
          revokingInvite
            ? `The invitation to ${revokingInvite.email} will no longer be valid.`
            : ""
        }
        confirmLabel="Revoke"
        isLoading={savingRevoke}
      />
    </div>
  );
}
