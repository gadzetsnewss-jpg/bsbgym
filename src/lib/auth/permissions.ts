/**
 * Permission model (Phase 3).
 *
 * Permissions are stored per-role in the database (`role_permissions`) and
 * seeded per organization by `create_organization`. These constants are the
 * single source of truth in the application for gate checks - they mirror the
 * seed values in the migration and must stay in sync.
 *
 * The database remains the source of truth: the app context is built from the
 * member's actual `role_permissions` rows, and `hasPermission` is only used to
 * decide UI visibility (buttons, menu items). RLS is the final enforcement.
 */

export const PERMISSIONS = {
  dashboard: { view: "dashboard.view" },
  members: { view: "members.view", manage: "members.manage" },
  memberships: { view: "memberships.view", manage: "memberships.manage" },
  billing: { view: "billing.view", manage: "billing.manage" },
  attendance: { view: "attendance.view", manage: "attendance.manage" },
  trainers: { view: "trainers.view", manage: "trainers.manage" },
  classes: { view: "classes.view", manage: "classes.manage" },
  inventory: { view: "inventory.view", manage: "inventory.manage" },
  crm: { view: "crm.view", manage: "crm.manage" },
  finance: { view: "finance.view", manage: "finance.manage" },
  reports: { view: "reports.view" },
  settings: { view: "settings.view", manage: "settings.manage" },
  users: { manage: "users.manage" },
  branches: { manage: "branches.manage" },
  invites: { send: "invites.send" },
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS][keyof (typeof PERMISSIONS)[keyof typeof PERMISSIONS]];

/** All known permission strings (used by seed/migration parity checks). */
export const ALL_PERMISSIONS: readonly string[] = Object.values(PERMISSIONS)
  .map((group) => Object.values(group))
  .flat();

/** System role slugs (mirrors the `roles` seed in create_organization). */
export const SYSTEM_ROLE_SLUGS = ["owner", "admin", "manager", "staff"] as const;
export type SystemRoleSlug = (typeof SYSTEM_ROLE_SLUGS)[number];

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
