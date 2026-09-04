/**
 * Unit tests for the Phase 1.2 route-level permission map.
 */

import { describe, expect, it } from "vitest";
import { requiredPermissionForPath } from "@/config/route-permissions";

describe("requiredPermissionForPath", () => {
  it("maps top-level routes to their permissions", () => {
    expect(requiredPermissionForPath("/billing")).toBe("billing.view");
    expect(requiredPermissionForPath("/finance")).toBe("finance.view");
    expect(requiredPermissionForPath("/pos")).toBe("pos.view");
    expect(requiredPermissionForPath("/reports")).toBe("reports.view");
    expect(requiredPermissionForPath("/members")).toBe("members.view");
    expect(requiredPermissionForPath("/settings/branches")).toBe("branches.view");
  });

  it("applies the longest prefix rule for nested routes", () => {
    expect(requiredPermissionForPath("/billing/gst-master")).toBe("gst.view");
    expect(requiredPermissionForPath("/billing/gst-master/settings")).toBe("gst.view");
    expect(requiredPermissionForPath("/billing/invoices")).toBe("billing.view");
    expect(requiredPermissionForPath("/settings/organization")).toBe("organization.manage");
    expect(requiredPermissionForPath("/settings/users-roles")).toBe("users.view");
  });

  it("keeps profile and access-denied routes open to every member", () => {
    expect(requiredPermissionForPath("/settings/profile")).toBeNull();
    expect(requiredPermissionForPath("/access-denied")).toBeNull();
  });

  it("returns null for unmatched routes", () => {
    expect(requiredPermissionForPath("/onboarding")).toBeNull();
    expect(requiredPermissionForPath("/")).toBeNull();
  });
});
