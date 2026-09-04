/**
 * Route-level permission map (Phase 1.2).
 *
 * Maps path prefixes to the permission a member must hold to open the route.
 * Used by the server layout (`(app)/layout.tsx`) for app-level authorization:
 * an authenticated member without the required permission is redirected to the
 * Access Denied page. This is UX/route-level enforcement on top of the real
 * security boundary (RLS). In preview mode the check is skipped entirely.
 *
 * Rules are matched by the longest prefix, so `/billing/gst-master` (gst.view)
 * wins over `/billing` (billing.view).
 */

export interface RoutePermissionRule {
  /** Path prefix, e.g. "/billing". Matches the path and every deeper route. */
  path: string;
  permission: string;
}

export const ROUTE_PERMISSIONS: RoutePermissionRule[] = [
  { path: "/billing/gst-master", permission: "gst.view" },
  { path: "/billing", permission: "billing.view" },
  { path: "/finance", permission: "finance.view" },
  { path: "/pos", permission: "pos.view" },
  { path: "/reports", permission: "reports.view" },
  { path: "/settings/organization", permission: "organization.manage" },
  { path: "/settings/users-roles", permission: "users.view" },
  { path: "/settings/permissions", permission: "roles.view" },
  { path: "/settings/branches", permission: "branches.view" },
  { path: "/dashboard", permission: "dashboard.view" },
  { path: "/members", permission: "members.view" },
  { path: "/memberships", permission: "memberships.view" },
  { path: "/attendance", permission: "attendance.view" },
  { path: "/trainers", permission: "trainers.view" },
  { path: "/classes", permission: "classes.view" },
  { path: "/inventory", permission: "inventory.view" },
  { path: "/crm", permission: "crm.view" },
  { path: "/notifications", permission: "dashboard.view" },
];

/** Routes every authenticated member may open regardless of role. */
const PUBLIC_ROUTE_PATHS = ["/access-denied", "/settings/profile"];

/**
 * The permission required to open `pathname`, or null when the route is public
 * (every authenticated member may open it).
 */
export function requiredPermissionForPath(pathname: string): string | null {
  if (PUBLIC_ROUTE_PATHS.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return null;
  }
  const sorted = [...ROUTE_PERMISSIONS].sort(
    (a, b) => b.path.length - a.path.length,
  );
  const rule = sorted.find(
    (r) => pathname === r.path || pathname.startsWith(`${r.path}/`),
  );
  return rule?.permission ?? null;
}
