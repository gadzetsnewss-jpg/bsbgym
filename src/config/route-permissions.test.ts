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
    expect(requiredPermissionForPath("/settings/invoice-settings")).toBe("settings.view");
    expect(requiredPermissionForPath("/settings/tax-gst")).toBe("gst.view");
    expect(requiredPermissionForPath("/settings/general")).toBe("settings.view");
  });

  it("applies the longest prefix rule for nested routes", () => {
    expect(requiredPermissionForPath("/billing/gst-master")).toBe("gst.view");
    expect(requiredPermissionForPath("/billing/gst-master/settings")).toBe("gst.view");
    expect(requiredPermissionForPath("/billing/invoices")).toBe("billing.view");
    expect(requiredPermissionForPath("/billing/new-invoice")).toBe("billing.create");
    expect(requiredPermissionForPath("/billing/payments")).toBe("payments.view");
    expect(requiredPermissionForPath("/billing/credit-notes")).toBe("billing.create");
    expect(requiredPermissionForPath("/billing/refunds")).toBe("billing.refund");
    expect(requiredPermissionForPath("/billing/outstanding")).toBe("billing.view");
    expect(requiredPermissionForPath("/settings/organization")).toBe("organization.manage");
    expect(requiredPermissionForPath("/settings/users-roles")).toBe("users.view");
    expect(requiredPermissionForPath("/settings/invoice-settings")).toBe("settings.view");
    expect(requiredPermissionForPath("/settings/tax-gst")).toBe("gst.view");
    expect(requiredPermissionForPath("/settings/general")).toBe("settings.view");
  });

  it("requires members.create to open the add member route", () => {
    expect(requiredPermissionForPath("/members/add")).toBe("members.create");
    expect(requiredPermissionForPath("/members/inactive")).toBe("members.view");
    expect(requiredPermissionForPath("/members/8f1d2c3b-0000-0000-0000-000000000000")).toBe(
      "members.view",
    );
    expect(
      requiredPermissionForPath("/members/8f1d2c3b-0000-0000-0000-000000000000/edit"),
    ).toBe("members.view");
  });

  it("maps catalog module create routes to their manage permissions", () => {
    expect(requiredPermissionForPath("/trainers/add")).toBe("trainers.create");
    expect(requiredPermissionForPath("/memberships/plans/add")).toBe("memberships.create");
    expect(requiredPermissionForPath("/billing/gst-master/add")).toBe("gst.manage");
    expect(requiredPermissionForPath("/fitness")).toBe("fitness.view");
    expect(requiredPermissionForPath("/fitness/exercises")).toBe("fitness.view");
    expect(requiredPermissionForPath("/fitness/exercises/add")).toBe("fitness.manage");
    expect(requiredPermissionForPath("/classes/schedule/add")).toBe("classes.manage");
    expect(requiredPermissionForPath("/inventory/products/add")).toBe("inventory.manage");
    expect(requiredPermissionForPath("/inventory/suppliers/add")).toBe("inventory.manage");
    expect(requiredPermissionForPath("/inventory/products")).toBe("inventory.view");
  });

  it("maps operations module create routes to their write permissions", () => {
    expect(requiredPermissionForPath("/memberships/active/add")).toBe("memberships.create");
    expect(requiredPermissionForPath("/memberships/renewals/add")).toBe("memberships.create");
    expect(requiredPermissionForPath("/memberships/freeze-extend/add")).toBe("memberships.freeze");
    expect(requiredPermissionForPath("/memberships/active")).toBe("memberships.view");
    expect(requiredPermissionForPath("/members/expiring")).toBe("memberships.view");
    expect(requiredPermissionForPath("/attendance/add")).toBe("attendance.create");
    expect(requiredPermissionForPath("/attendance")).toBe("attendance.view");
    expect(requiredPermissionForPath("/trainers/assignments/add")).toBe("trainers.assign");
    expect(requiredPermissionForPath("/trainers/pt-sessions/add")).toBe("trainers.assign");
    expect(requiredPermissionForPath("/classes/bookings/add")).toBe("bookings.manage");
    expect(requiredPermissionForPath("/classes/waitlist/add")).toBe("bookings.manage");
    expect(requiredPermissionForPath("/classes/bookings")).toBe("classes.view");
    expect(requiredPermissionForPath("/fitness/workout-plans/add")).toBe("fitness.manage");
    expect(requiredPermissionForPath("/fitness/diet-plans/add")).toBe("fitness.manage");
    expect(requiredPermissionForPath("/fitness/measurements/add")).toBe("fitness.manage");
    expect(requiredPermissionForPath("/fitness/progress/add")).toBe("fitness.manage");
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
