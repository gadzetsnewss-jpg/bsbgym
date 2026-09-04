/**
 * Unit tests for the permission model (Phase 3).
 */

import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  SYSTEM_ROLE_SLUGS,
  isSystemRole,
  isAdminRole,
  isOwnerRole,
  hasRole,
  hasPermission,
  canGrantPermissions,
  permissionOptions,
  USER_STATUS_LABELS,
  INVITATION_STATUS_LABELS,
} from "@/lib/auth/permissions";

/**
 * The Phase 1.2 owner catalogue, mirrored verbatim from
 * `seed_default_role_permissions` in
 * `20260831000005_phase_1_2_security.sql`. This test keeps the TypeScript
 * model and the database seed in sync.
 */
const OWNER_CATALOGUE = [
  "dashboard.view",

  "members.view", "members.create", "members.update", "members.delete", "members.export",

  "memberships.view", "memberships.create", "memberships.update",
  "memberships.freeze", "memberships.extend", "memberships.transfer",

  "billing.view", "billing.create", "billing.edit", "billing.refund",
  "billing.void", "billing.export",

  "gst.view", "gst.manage",

  "payments.view", "payments.create", "payments.refund",

  "attendance.view", "attendance.create", "attendance.manage",

  "trainers.view", "trainers.create", "trainers.edit", "trainers.assign", "trainers.reassign",

  "classes.view", "classes.manage", "bookings.manage",

  "pos.view", "pos.create",

  "inventory.view", "inventory.manage",

  "crm.view", "crm.manage",

  "finance.view", "finance.manage",

  "reports.view", "reports.export",

  "staff.view", "staff.manage",

  "settings.view", "settings.manage",

  "users.view", "users.manage",

  "roles.view", "roles.manage",

  "branches.view", "branches.manage",

  "organization.manage",

  "invites.send",
];

describe("PERMISSIONS", () => {
  it("exposes users.manage and invites.send for the user-management UI", () => {
    expect(PERMISSIONS.users.manage).toBe("users.manage");
    expect(PERMISSIONS.invites.send).toBe("invites.send");
    expect(PERMISSIONS.settings.manage).toBe("settings.manage");
    expect(PERMISSIONS.dashboard.view).toBe("dashboard.view");
  });

  it("exposes the full granular permission set", () => {
    expect(PERMISSIONS.members.view).toBe("members.view");
    expect(PERMISSIONS.members.create).toBe("members.create");
    expect(PERMISSIONS.members.update).toBe("members.update");
    expect(PERMISSIONS.members.delete).toBe("members.delete");
    expect(PERMISSIONS.members.export).toBe("members.export");
    expect(PERMISSIONS.memberships.create).toBe("memberships.create");
    expect(PERMISSIONS.billing.refund).toBe("billing.refund");
    expect(PERMISSIONS.billing.export).toBe("billing.export");
    expect(PERMISSIONS.attendance.create).toBe("attendance.create");
    expect(PERMISSIONS.reports.view).toBe("reports.view");
    expect(PERMISSIONS.reports.export).toBe("reports.export");
    expect(PERMISSIONS.users.view).toBe("users.view");
    expect(PERMISSIONS.roles.view).toBe("roles.view");
    expect(PERMISSIONS.roles.manage).toBe("roles.manage");
    expect(PERMISSIONS.branches.view).toBe("branches.view");
  });

  it("exposes the Phase 1.2 permission keys", () => {
    expect(PERMISSIONS.gst.view).toBe("gst.view");
    expect(PERMISSIONS.gst.manage).toBe("gst.manage");
    expect(PERMISSIONS.payments.view).toBe("payments.view");
    expect(PERMISSIONS.payments.refund).toBe("payments.refund");
    expect(PERMISSIONS.pos.view).toBe("pos.view");
    expect(PERMISSIONS.pos.create).toBe("pos.create");
    expect(PERMISSIONS.organization.manage).toBe("organization.manage");
    expect(PERMISSIONS.staff.view).toBe("staff.view");
    expect(PERMISSIONS.staff.manage).toBe("staff.manage");
    expect(PERMISSIONS.bookings.manage).toBe("bookings.manage");
    expect(PERMISSIONS.memberships.freeze).toBe("memberships.freeze");
    expect(PERMISSIONS.memberships.extend).toBe("memberships.extend");
    expect(PERMISSIONS.memberships.transfer).toBe("memberships.transfer");
    expect(PERMISSIONS.billing.edit).toBe("billing.edit");
    expect(PERMISSIONS.billing.void).toBe("billing.void");
    expect(PERMISSIONS.attendance.manage).toBe("attendance.manage");
    expect(PERMISSIONS.trainers.create).toBe("trainers.create");
    expect(PERMISSIONS.trainers.edit).toBe("trainers.edit");
    expect(PERMISSIONS.trainers.assign).toBe("trainers.assign");
    expect(PERMISSIONS.trainers.reassign).toBe("trainers.reassign");
  });

  it("ALL_PERMISSIONS matches the database seed catalogue exactly", () => {
    const flat = [...ALL_PERMISSIONS].sort();
    expect(flat).toEqual([...OWNER_CATALOGUE].sort());
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat.length).toBe(56);
  });

  it("ALL_PERMISSIONS flattens every group without duplicates", () => {
    const flat = ALL_PERMISSIONS;
    expect(flat.length).toBeGreaterThan(0);
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toContain("users.manage");
    expect(flat).toContain("invites.send");
    expect(flat).toContain("members.delete");
    expect(flat).toContain("reports.export");
  });
});

describe("system roles", () => {
  it("has the four seeded role slugs", () => {
    expect(SYSTEM_ROLE_SLUGS).toEqual(["owner", "admin", "manager", "staff"]);
  });

  it("treats owner and admin as administrators", () => {
    expect(isAdminRole("owner")).toBe(true);
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("manager")).toBe(false);
    expect(isAdminRole("staff")).toBe(false);
    expect(isAdminRole(null)).toBe(false);
  });

  it("only treats owner as the owner", () => {
    expect(isOwnerRole("owner")).toBe(true);
    expect(isOwnerRole("admin")).toBe(false);
    expect(isOwnerRole(undefined)).toBe(false);
  });

  it("detects system roles (protected from deactivation)", () => {
    expect(isSystemRole("owner")).toBe(true);
    expect(isSystemRole("admin")).toBe(true);
    expect(isSystemRole("manager")).toBe(true);
    expect(isSystemRole("staff")).toBe(true);
    expect(isSystemRole("receptionist")).toBe(false);
    expect(isSystemRole("trainer")).toBe(false);
    expect(isSystemRole(undefined)).toBe(false);
    expect(isSystemRole(null)).toBe(false);
  });

  it("hasRole matches the role slug against a list of slugs", () => {
    expect(hasRole("owner", ["owner", "admin"])).toBe(true);
    expect(hasRole("admin", ["owner", "admin"])).toBe(true);
    expect(hasRole("trainer", ["owner", "admin"])).toBe(false);
    expect(hasRole("trainer", [])).toBe(false);
    expect(hasRole(undefined, ["owner"])).toBe(false);
    expect(hasRole(null, ["owner"])).toBe(false);
  });
});

describe("hasPermission", () => {
  it("returns true when the permission is held", () => {
    expect(hasPermission(["users.manage", "dashboard.view"], "users.manage")).toBe(true);
  });

  it("returns false when missing, empty, or undefined", () => {
    expect(hasPermission(["dashboard.view"], "users.manage")).toBe(false);
    expect(hasPermission([], "users.manage")).toBe(false);
    expect(hasPermission(null, "users.manage")).toBe(false);
    expect(hasPermission(undefined, "users.manage")).toBe(false);
  });
});

describe("canGrantPermissions", () => {
  it("allows granting permissions the caller holds", () => {
    expect(
      canGrantPermissions(["members.view", "members.create", "dashboard.view"], [
        "members.view",
        "members.create",
      ]),
    ).toBe(true);
  });

  it("rejects granting any permission the caller does not hold", () => {
    expect(
      canGrantPermissions(["members.view", "dashboard.view"], ["members.view", "members.delete"]),
    ).toBe(false);
  });

  it("rejects granting any permission when the caller holds none", () => {
    expect(canGrantPermissions([], ["members.view"])).toBe(false);
    expect(canGrantPermissions(null, ["members.view"])).toBe(false);
  });
});

describe("permissionOptions", () => {
  it("produces one labelled option per permission, grouped", () => {
    const options = permissionOptions();
    expect(options.length).toBe(ALL_PERMISSIONS.length);
    for (const option of options) {
      expect(option.group.length).toBeGreaterThan(0);
      expect(option.label.length).toBeGreaterThan(0);
      expect(ALL_PERMISSIONS).toContain(option.value);
    }
  });
});

describe("status labels", () => {
  it("maps every user status", () => {
    expect(USER_STATUS_LABELS).toMatchObject({
      active: "Active",
      invited: "Invited",
      suspended: "Suspended",
      deactivated: "Deactivated",
    });
  });

  it("maps every invitation status", () => {
    expect(INVITATION_STATUS_LABELS).toMatchObject({
      pending: "Pending",
      accepted: "Accepted",
      revoked: "Revoked",
      expired: "Expired",
    });
  });
});
