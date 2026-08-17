/**
 * Permission model (Phase 3).
 *
 * Permissions are stored per-role in the database (`role_permissions`) and
 * seeded per organization by `create_organization`. These constants are the
 * single source of truth in the application for gate checks - they mirror the
 * seed values in the migration and must stay in sync.
 *
 * Model: granular permissions (`members.view`, `members.create`,
 * `members.delete`, `billing.refund`, `reports.export`, ...). Older coarse
 * `*.manage` rows for members/memberships/billing/attendance were migrated to
 * their granular equivalents by `20260817000003_rbac_roles_audit.sql`.
 *
 * The database remains the source of truth: the app context is built from the
 * member's actual `role_permissions` rows, and these helpers are only used to
 * decide UI visibility (buttons, menu items) and to mirror the server-side
 * rules. RLS + SECURITY DEFINER RPCs are the final enforcement.
 */

export const PERMISSIONS = {
  dashboard: { view: "dashboard.view" },
  members: {
    view: "members.view",
    create: "members.create",
    update: "members.update",
    delete: "members.delete",
    export: "members.export",
  },
  memberships: {
    view: "memberships.view",
    create: "memberships.create",
    update: "memberships.update",
  },
  billing: {
    view: "billing.view",
    create: "billing.create",
    refund: "billing.refund",
    export: "billing.export",
  },
  attendance: { view: "attendance.view", create: "attendance.create" },
  trainers: { view: "trainers.view" },
  classes: { view: "classes.view", manage: "classes.manage" },
  inventory: { view: "inventory.view", manage: "inventory.manage" },
  crm: { view: "crm.view", manage: "crm.manage" },
  finance: { view: "finance.view", manage: "finance.manage" },
  reports: { view: "reports.view", export: "reports.export" },
  settings: { view: "settings.view", manage: "settings.manage" },
  users: { view: "users.view", manage: "users.manage" },
  roles: { view: "roles.view", manage: "roles.manage" },
  branches: { view: "branches.view", manage: "branches.manage" },
  invites: { send: "invites.send" },
} as const;

type PermissionGroup = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export type Permission =
  PermissionGroup[keyof PermissionGroup];

/** All known permission strings (used by seed/migration parity checks). */
export const ALL_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS)
  .map((group) => Object.values(group))
  .flat();

/** System role slugs (mirrors the `roles` seed in create_organization). */
export const SYSTEM_ROLE_SLUGS = ["owner", "admin", "manager", "staff"] as const;
export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number];

/** True when the role is a protected system role (cannot be deactivated). */
export function isSystemRole(slug: string | undefined | null): boolean {
  return slug !== undefined && slug !== null && (SYSTEM_ROLE_SLUGS as readonly string[]).includes(slug);
}

/** True when the role is an organization administrator (owner or admin). */
export function isAdminRole(slug: string | undefined | null): boolean {
  return slug === "owner" || slug === "admin";
}

/** True when the role is the organization owner. */
export function isOwnerRole(slug: string | undefined | null): boolean {
  return slug === "owner";
}

/** True when the member holds every permission listed. */
export function hasPermission(
  permissions: readonly string[] | undefined | null,
  permission: string,
): boolean {
  return permissions?.includes(permission) ?? false;
}

/** True when the member holds at least one of the listed permissions. */
export function hasAnyPermission(
  permissions: readonly string[] | undefined | null,
  required: readonly string[],
): boolean {
  return required.some((permission) => hasPermission(permissions, permission));
}

/** True when the member holds every one of the listed permissions. */
export function hasAllPermissions(
  permissions: readonly string[] | undefined | null,
  required: readonly string[],
): boolean {
  return required.every((permission) => hasPermission(permissions, permission));
}

/* ---------------------------------------------------------------------------
   Authorization utilities (mirror the SECURITY DEFINER RPC rules in the
   migration - used for UI decisions and test parity; RLS is enforcement).
   --------------------------------------------------------------------------- */

/** True when the member row represents an active organization membership. */
export function isOrganizationMember(
  member: { status?: string | null } | null | undefined,
): boolean {
  return member?.status === "active";
}

/**
 * True when the member may operate in the given branch. Access is "all
 * branches" or an explicit member_branches grant. The server-side context only
 * ever contains authorized branches; this helper decides UI visibility.
 */
export function canAccessBranch(
  member: { accessAllBranches?: boolean } | null | undefined,
  authorizedBranchIds: readonly string[] | undefined | null,
  branchId: string,
): boolean {
  if (!member) return false;
  if (member.accessAllBranches) return true;
  return authorizedBranchIds?.includes(branchId) ?? false;
}

/**
 * Privilege-escalation rule shared with the server (`assert_caller_can_grant`):
 * a caller may only grant permissions they personally hold (unless owner). Used
 * by the role-management UI to disable options the caller could not save.
 */
export function canGrantPermissions(
  callerPermissions: readonly string[] | undefined | null,
  requestedPermissions: readonly string[],
): boolean {
  return requestedPermissions.every((permission) =>
    hasPermission(callerPermissions, permission),
  );
}

/* ---------------------------------------------------------------------------
   Presentation helpers for the role manager (labels mirror ALL_PERMISSIONS).
   --------------------------------------------------------------------------- */

export interface PermissionOption {
  value: string;
  label: string;
  group: string;
}

const GROUP_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  members: "Members",
  memberships: "Memberships",
  billing: "Billing",
  attendance: "Attendance",
  trainers: "Trainers",
  classes: "Classes",
  inventory: "Inventory",
  crm: "CRM",
  finance: "Finance",
  reports: "Reports",
  settings: "Settings",
  users: "Users",
  roles: "Roles",
  branches: "Branches",
  invites: "Invitations",
};

function permissionLabel(value: string): string {
  const [group, action] = value.split(".");
  const actionLabels: Record<string, string> = {
    view: "View",
    create: "Create",
    update: "Update",
    delete: "Delete",
    export: "Export",
    refund: "Process refunds",
    manage: "Manage",
    send: "Send",
  };
  return `${actionLabels[action] ?? action} ${GROUP_LABELS[group] ?? group}`;
}

/** Flat, grouped list used by the role permissions editor. */
export function permissionOptions(): PermissionOption[] {
  return ALL_PERMISSIONS.map((value) => ({
    value,
    label: permissionLabel(value),
    group: GROUP_LABELS[value.split(".")[0]] ?? "Other",
  }));
}

/* ---------------------------------------------------------------------------
   Human-friendly labels for status enums (presentation only - the enum values
   in the database remain the source of truth).
   --------------------------------------------------------------------------- */

export const USER_STATUS_LABELS: Record<string, string> = {
  active: "Active",
  invited: "Invited",
  suspended: "Suspended",
  deactivated: "Deactivated",
};

export const INVITATION_STATUS_LABELS: Record<string, string> = {
  pending: "Pending",
  accepted: "Accepted",
  revoked: "Revoked",
  expired: "Expired",
};
