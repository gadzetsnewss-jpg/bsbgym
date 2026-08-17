/**
 * Unit tests for the permission model (Phase 3).
 */

import { describe, expect, it } from "vitest";
import {
  PERMISSIONS,
  ALL_PERMISSIONS,
  SYSTEM_ROLE_SLUGS,
  isAdminRole,
  isOwnerRole,
  hasPermission,
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

  it("ALL_PERMISSIONS flattens every group without duplicates", () => {
    const flat = ALL_PERMISSIONS;
    expect(flat.length).toBeGreaterThan(0);
    expect(new Set(flat).size).toBe(flat.length);
    expect(flat).toContain("users.manage");
    expect(flat).toContain("invites.send");
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
