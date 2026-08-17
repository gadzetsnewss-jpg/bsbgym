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
  hasPermission,
  canGrantPermissions,
  permissionOptions,
  USER_STATUS_LABELS,
  INVITATION_STATUS_LABELS,
} from "@/lib/auth/permissions";

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
