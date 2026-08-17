"use client";

/**
 * Permissions / Role manager page (Phase 3 Part 2).
 *
 * Lists every role in the organization with its permission set and active
 * member count, and lets admins create/edit/deactivate roles. All mutations go
 * through the SECURITY DEFINER RPCs - the server re-validates organization
 * membership, admin status and the privilege-escalation guard, so the UI here
 * only mirrors what the server will accept. RLS is the final enforcement layer.
 */

import * as React from "react";
import {
  KeyRound,
  Pencil,
  Plus,
  Power,
  RotateCcw,
  Shield,
  ShieldAlert,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RowActions } from "@/components/ui/row-actions";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  fetchRolesWithPermissions,
  createRole,
  updateRole,
  setRolePermissions,
  setRoleStatus,
  type RoleWithPermissions,
} from "@/lib/org/members";
import {
  permissionOptions,
  isSystemRole,
  canGrantPermissions,
  type PermissionOption,
} from "@/lib/auth/permissions";

type RoleEditorState = {
  mode: "create" | "edit";
  role: RoleWithPermissions | null;
  name: string;
  slug: string;
  description: string;
  permissions: string[];
};

function buildInitialState(mode: "create" | "edit", role: RoleWithPermissions | null): RoleEditorState {
  return {
    mode,
    role,
    name: role?.name ?? "",
    slug: role?.slug ?? "",
    description: role?.description ?? "",
    permissions: role?.permissions ?? [],
  };
}

export function RolesManagerPanel() {
  const { organization, permissions: callerPermissions } = useOrganization();
  const { toast } = useToast();

  const orgId = organization?.id;

  const [roles, setRoles] = React.useState<RoleWithPermissions[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editor, setEditor] = React.useState<RoleEditorState | null>(null);
  const [editorErrors, setEditorErrors] = React.useState<Record<string, string>>({});
  const [saving, setSaving] = React.useState(false);

  const [deactivateRole, setDeactivateRole] = React.useState<RoleWithPermissions | null>(null);
  const [savingStatus, setSavingStatus] = React.useState(false);

  const canManage = organization ? canGrantPermissions(callerPermissions, ["roles.manage"]) : false;

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const res = await fetchRolesWithPermissions(orgId);
    setLoading(false);
    if (res.error) {
      setError(res.error.message);
      return;
    }
    if (res.data) setRoles(res.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const allPermissionOptions = React.useMemo(() => permissionOptions(), []);

  const groupedPermissionOptions = React.useMemo(() => {
    const groups = new Map<string, PermissionOption[]>();
    for (const option of allPermissionOptions) {
      const list = groups.get(option.group) ?? [];
      list.push(option);
      groups.set(option.group, list);
    }
    return Array.from(groups.entries());
  }, [allPermissionOptions]);

  const openCreate = () => {
    setEditor(buildInitialState("create", null));
    setEditorErrors({});
  };

  const openEdit = (role: RoleWithPermissions) => {
    setEditor(buildInitialState("edit", role));
    setEditorErrors({});
  };

  const togglePermission = (value: string, checked: boolean) => {
    if (!editor) return;
    setEditor((prev) => {
      if (!prev) return prev;
      const next = checked
        ? [...prev.permissions, value]
        : prev.permissions.filter((p) => p !== value);
      return { ...prev, permissions: next };
    });
  };

  const saveEditor = async () => {
    if (!editor || !orgId) return;

    const errors: Record<string, string> = {};
    if (!editor.name.trim()) errors.name = "Role name is required.";
    if (editor.mode === "create") {
      if (!editor.slug.trim()) errors.slug = "Slug is required.";
      else if (!/^[a-z0-9_]+$/.test(editor.slug)) {
        errors.slug = "Lowercase letters, numbers and underscores only.";
      }
    }
    if (Object.keys(errors).length > 0) {
      setEditorErrors(errors);
      return;
    }

    setSaving(true);
    if (editor.mode === "create") {
      const res = await createRole({
        organizationId: orgId,
        name: editor.name.trim(),
        slug: editor.slug.trim(),
        description: editor.description.trim() || null,
        permissions: editor.permissions,
      });
      setSaving(false);
      if (res.error) {
        toast({ title: "Could not create role", description: res.error.message, variant: "error" });
        return;
      }
      toast({ title: "Role created", variant: "success" });
    } else {
      const role = editor.role;
      if (!role) return;
      const [updateRes, permsRes] = await Promise.all([
        updateRole(role.id, editor.name.trim(), editor.description.trim() || null),
        setRolePermissions(role.id, editor.permissions),
      ]);
      setSaving(false);
      const firstError = updateRes.error ?? permsRes.error;
      if (firstError) {
        toast({ title: "Could not update role", description: firstError.message, variant: "error" });
        return;
      }
      toast({ title: "Role updated", variant: "success" });
    }

    setEditor(null);
    void load();
  };

  const confirmDeactivate = async () => {
    if (!deactivateRole) return;
    setSavingStatus(true);
    const res = await setRoleStatus(deactivateRole.id, false);
    setSavingStatus(false);
    if (res.error) {
      toast({ title: "Could not deactivate role", description: res.error.message, variant: "error" });
      return;
    }
    toast({ title: "Role deactivated", variant: "success" });
    setDeactivateRole(null);
    void load();
  };

  const confirmReactivate = async (role: RoleWithPermissions) => {
    setSavingStatus(true);
    const res = await setRoleStatus(role.id, true);
    setSavingStatus(false);
    if (res.error) {
      toast({ title: "Could not reactivate role", description: res.error.message, variant: "error" });
      return;
    }
    toast({ title: "Role reactivated", variant: "success" });
    void load();
  };

  const columns: Column<RoleWithPermissions>[] = [
    {
      id: "role",
      header: "Role",
      cell: (row) => (
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-ink">{row.name}</span>
            {row.isSystem && <Badge tone="primary">System</Badge>}
            {!row.isActive && <Badge tone="neutral">Deactivated</Badge>}
          </div>
          {row.description && (
            <p className="mt-0.5 truncate text-xs text-neutral-500">{row.description}</p>
          )}
        </div>
      ),
      sortValue: (row) => row.name.toLowerCase(),
    },
    {
      id: "slug",
      header: "Slug",
      cell: (row) => <code className="text-xs text-neutral-500">{row.slug}</code>,
      sortValue: (row) => row.slug,
    },
    {
      id: "permissions",
      header: "Permissions",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.permissions.length === 0 ? (
            <span className="text-sm text-neutral-400">None</span>
          ) : (
            row.permissions.slice(0, 4).map((permission) => (
              <Badge key={permission} tone="neutral">
                {permission}
              </Badge>
            ))
          )}
          {row.permissions.length > 4 && (
            <Badge tone="neutral">+{row.permissions.length - 4} more</Badge>
          )}
        </div>
      ),
      sortValue: (row) => row.permissions.length,
    },
    {
      id: "members",
      header: "Members",
      cell: (row) => (
        <span className="flex items-center gap-1.5 text-sm text-neutral-600">
          <Users aria-hidden="true" className="size-4 text-neutral-400" />
          {row.memberCount}
        </span>
      ),
      sortValue: (row) => row.memberCount,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={row.isActive ? "active" : "deactivated"} />
      ),
      sortValue: (row) => (row.isActive ? "active" : "deactivated"),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        if (!canManage) return null;
        const isSystem = isSystemRole(row.slug);
        const canEdit = !isSystem || row.slug === "owner";
        return (
          <RowActions
            label={`Actions for role ${row.name}`}
            items={[
              {
                label: "Edit",
                icon: Pencil,
                onClick: () => openEdit(row),
                disabled: !canEdit,
              },
              ...(row.isActive
                ? [
                    {
                      label: "Deactivate",
                      icon: Power,
                      variant: "danger" as const,
                      onClick: () => setDeactivateRole(row),
                      disabled: isSystem || row.memberCount > 0,
                    },
                  ]
                : [
                    {
                      label: "Reactivate",
                      icon: RotateCcw,
                      onClick: () => void confirmReactivate(row),
                    },
                  ]),
            ]}
          />
        );
      },
    },
  ];

  if (!canManage) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Permissions"
          description="Role-based access control for your organization."
          icon={Shield}
        />
        <Card>
          <EmptyState
            title="You don't have access"
            description="Your current role cannot manage roles or permissions."
            icon={ShieldAlert}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Permissions"
        description="Create and manage roles, and decide what each role can see and do."
        icon={Shield}
        actions={
          <Button onClick={openCreate}>
            <Plus aria-hidden="true" className="size-4" />
            New role
          </Button>
        }
      />

      {error ? (
        <ErrorState
          title="Could not load roles"
          description={error}
          onRetry={() => void load()}
        />
      ) : loading ? (
        <LoadingState label="Loading roles…" />
      ) : roles.length === 0 ? (
        <Card>
          <EmptyState
            title="No roles yet"
            description="Create your first role to start controlling access."
            icon={KeyRound}
            action={{ label: "New role", onClick: openCreate }}
          />
        </Card>
      ) : (
        <DataTable
          columns={columns}
          data={roles}
          rowKey={(row) => row.id}
          emptyTitle="No roles"
          emptyDescription="Create a role to control what team members can do."
        />
      )}

      <Card>
        <CardHeader>
          <div>
            <CardTitle>About permissions</CardTitle>
            <CardDescription>
              Permissions are granted per role and enforced by the database.
              Deactivating a role blocks it from being assigned or invited;
              existing members keep working until they are reassigned.
            </CardDescription>
          </div>
        </CardHeader>
      </Card>

      {/* Create / edit role dialog */}
      <Modal
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={editor?.mode === "create" ? "New role" : `Edit ${editor?.role?.name ?? "role"}`}
        description={
          editor?.mode === "edit"
            ? "Update the name, description or permission set. Slugs are immutable."
            : "Choose a unique slug and the permissions this role should have."
        }
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditor(null)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void saveEditor()} isLoading={saving}>
              {editor?.mode === "create" ? "Create role" : "Save changes"}
            </Button>
          </>
        }
      >
        {editor && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField label="Role name" required error={editorErrors.name}>
                <Input
                  value={editor.name}
                  invalid={Boolean(editorErrors.name)}
                  placeholder="e.g. Front Desk"
                  onChange={(event) =>
                    setEditor((prev) => (prev ? { ...prev, name: event.target.value } : prev))
                  }
                />
              </FormField>
              <FormField
                label="Slug"
                required
                error={editorErrors.slug}
                hint={
                  editor.mode === "create"
                    ? "Used internally, cannot be changed later."
                    : "Immutable."
                }
              >
                <Input
                  value={editor.slug}
                  invalid={Boolean(editorErrors.slug)}
                  disabled={editor.mode === "edit"}
                  placeholder="front-desk"
                  onChange={(event) =>
                    setEditor((prev) =>
                      prev ? { ...prev, slug: event.target.value.toLowerCase() } : prev,
                    )
                  }
                />
              </FormField>
            </div>

            <FormField label="Description" hint="Shown next to the role in lists.">
              <Input
                value={editor.description}
                placeholder="What is this role responsible for?"
                onChange={(event) =>
                  setEditor((prev) =>
                    prev ? { ...prev, description: event.target.value } : prev,
                  )
                }
              />
            </FormField>

            <div>
              <p className="mb-2 text-sm font-medium text-ink">Permissions</p>
              <div className="max-h-72 space-y-4 overflow-y-auto rounded-lg border border-border bg-surface-muted p-4">
                {groupedPermissionOptions.map(([group, options]) => (
                  <fieldset key={group}>
                    <legend className="mb-1.5 text-xs font-semibold tracking-wide text-neutral-500 uppercase">
                      {group}
                    </legend>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {options.map((option) => {
                        const checked = editor.permissions.includes(option.value);
                        const disabled =
                          isSystemRole(editor.role?.slug) && editor.role?.slug === "owner"
                            ? false
                            : !canGrantPermissions(callerPermissions, [option.value]);
                        return (
                          <label
                            key={option.value}
                            className="flex items-center gap-2 text-sm text-neutral-700"
                          >
                            <Checkbox
                              checked={checked}
                              disabled={disabled}
                              onChange={(event) =>
                                togglePermission(option.value, event.target.checked)
                              }
                            />
                            <span className="min-w-0">{option.label}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                ))}
              </div>
              {editor.mode === "edit" && !isSystemRole(editor.role?.slug) && (
                <p className="mt-1.5 text-xs text-neutral-500">
                  You can only grant permissions you hold yourself. Options you
                  don't hold are disabled.
                </p>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Deactivate role confirm */}
      <ConfirmDialog
        open={Boolean(deactivateRole)}
        onClose={() => setDeactivateRole(null)}
        onConfirm={() => void confirmDeactivate()}
        title="Deactivate role"
        description={
          deactivateRole
            ? `"${deactivateRole.name}" will no longer be assignable to members or used for new invitations. Existing members keep their current access until reassigned.`
            : ""
        }
        confirmLabel="Deactivate"
        isLoading={savingStatus}
      />
    </div>
  );
}
