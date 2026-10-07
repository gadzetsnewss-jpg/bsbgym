/**
 * Route-level permission map (Phase 1.2 + Phase 1.3 general settings).
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
  { path: "/billing/gst-master/add", permission: "gst.manage" },
  { path: "/billing/gst-master", permission: "gst.view" },
  { path: "/billing/new-invoice", permission: "billing.create" },
  { path: "/billing/payments", permission: "payments.view" },
  { path: "/billing/credit-notes", permission: "billing.create" },
  { path: "/billing/refunds", permission: "billing.refund" },
  { path: "/billing", permission: "billing.view" },
  { path: "/finance", permission: "finance.view" },
  { path: "/pos", permission: "pos.view" },
  { path: "/reports", permission: "reports.view" },
  { path: "/settings/organization", permission: "organization.manage" },
  { path: "/settings/users-roles", permission: "users.view" },
  { path: "/settings/permissions", permission: "roles.view" },
  { path: "/settings/branches", permission: "branches.view" },
  { path: "/settings/invoice-settings", permission: "settings.view" },
  { path: "/settings/tax-gst", permission: "gst.view" },
  { path: "/settings/general", permission: "settings.view" },
  { path: "/dashboard", permission: "dashboard.view" },
  { path: "/members/add", permission: "members.create" },
  { path: "/members/inactive", permission: "members.view" },
  { path: "/members/expiring", permission: "memberships.view" },
  { path: "/members", permission: "members.view" },
  { path: "/memberships/plans/add", permission: "memberships.create" },
  { path: "/memberships/active/add", permission: "memberships.create" },
  { path: "/memberships/renewals/add", permission: "memberships.create" },
  { path: "/memberships/freeze-extend/add", permission: "memberships.freeze" },
  { path: "/memberships", permission: "memberships.view" },
  { path: "/attendance/add", permission: "attendance.create" },
  { path: "/attendance", permission: "attendance.view" },
  { path: "/trainers/assignments/add", permission: "trainers.assign" },
  { path: "/trainers/pt-sessions/add", permission: "trainers.assign" },
  { path: "/trainers/add", permission: "trainers.create" },
  { path: "/trainers", permission: "trainers.view" },
  { path: "/fitness/exercises/add", permission: "fitness.manage" },
  { path: "/fitness/workout-plans/add", permission: "fitness.manage" },
  { path: "/fitness/diet-plans/add", permission: "fitness.manage" },
  { path: "/fitness/measurements/add", permission: "fitness.manage" },
  { path: "/fitness/progress/add", permission: "fitness.manage" },
  { path: "/fitness", permission: "fitness.view" },
  { path: "/classes/schedule/add", permission: "classes.manage" },
  { path: "/classes/templates/add", permission: "classes.manage" },
  { path: "/classes/bookings/add", permission: "bookings.manage" },
  { path: "/classes/waitlist/add", permission: "bookings.manage" },
  { path: "/classes", permission: "classes.view" },
  { path: "/inventory/products/add", permission: "inventory.manage" },
  { path: "/inventory/suppliers/add", permission: "inventory.manage" },
  { path: "/inventory", permission: "inventory.view" },
  { path: "/crm/leads/add", permission: "crm.manage" },
  { path: "/crm/leads", permission: "crm.view" },
  { path: "/crm/follow-ups/add", permission: "crm.manage" },
  { path: "/crm/trials/add", permission: "crm.manage" },
  { path: "/crm/referrals/add", permission: "crm.manage" },
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
