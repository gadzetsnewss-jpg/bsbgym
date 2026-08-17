/**
 * Unit tests for authorization utilities (Phase 3 Part 2).
 *
 * These mirror the SECURITY DEFINER RPC rules: any/all permission checks,
 * branch access, organization membership and the privilege-escalation guard.
 * The database remains the real enforcement layer - these tests verify the
 * client-side helper behavior matches the documented server rules.
 */

import { describe, expect, it } from "vitest";
import {
  hasAnyPermission,
  hasAllPermissions,
  canAccessBranch,
  isOrganizationMember,
  canGrantPermissions,
} from "@/lib/auth/permissions";

describe("hasAnyPermission", () => {
  it("returns true when at least one listed permission is held", () => {
    expect(hasAnyPermission(["members.view", "members.delete"], ["members.delete", "billing.view"])).toBe(true);
  });

  it("returns false when none are held", () => {
    expect(hasAnyPermission(["dashboard.view"], ["members.view", "billing.view"])).toBe(false);
  });

  it("returns false for empty/undefined permission sets", () => {
    expect(hasAnyPermission([], ["members.view"])).toBe(false);
    expect(hasAnyPermission(null, ["members.view"])).toBe(false);
    expect(hasAnyPermission(["members.view"], [])).toBe(false);
  });
});

describe("hasAllPermissions", () => {
  it("returns true when every listed permission is held", () => {
    expect(
      hasAllPermissions(
        ["members.view", "members.create", "members.update", "dashboard.view"],
        ["members.view", "members.create", "members.update"],
      ),
    ).toBe(true);
  });

  it("returns false when at least one is missing", () => {
    expect(
      hasAllPermissions(["members.view", "dashboard.view"], ["members.view", "members.create"]),
    ).toBe(false);
  });

  it("returns true vacuously for an empty requirement list", () => {
    expect(hasAllPermissions([], [])).toBe(true);
  });
});

describe("canAccessBranch", () => {
  const memberAll = { accessAllBranches: true };
  const memberScoped = { accessAllBranches: false };
  const authorized = ["branch-a", "branch-b"];

  it("grants access to every branch for all-branches members", () => {
    expect(canAccessBranch(memberAll, authorized, "branch-a")).toBe(true);
    expect(canAccessBranch(memberAll, authorized, "somewhere-else")).toBe(true);
  });

  it("grants access only to explicitly authorized branches otherwise", () => {
    expect(canAccessBranch(memberScoped, authorized, "branch-a")).toBe(true);
    expect(canAccessBranch(memberScoped, authorized, "branch-b")).toBe(true);
    expect(canAccessBranch(memberScoped, authorized, "branch-c")).toBe(false);
  });

  it("rejects unknown members regardless of branch list", () => {
    expect(canAccessBranch(null, authorized, "branch-a")).toBe(false);
    expect(canAccessBranch(undefined, authorized, "branch-a")).toBe(false);
  });

  it("rejects when there is no authorized branch list", () => {
    expect(canAccessBranch(memberScoped, [], "branch-a")).toBe(false);
    expect(canAccessBranch(memberScoped, null, "branch-a")).toBe(false);
    expect(canAccessBranch(memberScoped, undefined, "branch-a")).toBe(false);
  });
});

describe("isOrganizationMember", () => {
  it("accepts only active memberships", () => {
    expect(isOrganizationMember({ status: "active" })).toBe(true);
    expect(isOrganizationMember({ status: "suspended" })).toBe(false);
    expect(isOrganizationMember({ status: "deactivated" })).toBe(false);
    expect(isOrganizationMember({ status: "invited" })).toBe(false);
    expect(isOrganizationMember(null)).toBe(false);
    expect(isOrganizationMember(undefined)).toBe(false);
    expect(isOrganizationMember({})).toBe(false);
  });
});

describe("canGrantPermissions (privilege escalation guard)", () => {
  it("lets an owner-equivalent caller grant any set they hold", () => {
    const ownerPermissions = [
      "dashboard.view",
      "members.view",
      "members.create",
      "members.update",
      "members.delete",
      "roles.manage",
    ];
    expect(canGrantPermissions(ownerPermissions, ["members.view", "members.create"])).toBe(true);
  });

  it("blocks granting a permission the caller does not hold", () => {
    const caller = ["members.view", "dashboard.view"];
    expect(canGrantPermissions(caller, ["members.view", "members.delete"])).toBe(false);
    expect(canGrantPermissions(caller, ["roles.manage"])).toBe(false);
  });

  it("blocks granting anything when the caller holds nothing", () => {
    expect(canGrantPermissions([], ["members.view"])).toBe(false);
    expect(canGrantPermissions(undefined, ["members.view"])).toBe(false);
  });

  it("is permissive about a fully held identical set (no-op edit)", () => {
    const set = ["members.view", "billing.refund"];
    expect(canGrantPermissions(set, set)).toBe(true);
  });
});
