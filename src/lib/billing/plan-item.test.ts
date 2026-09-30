import { describe, expect, it } from "vitest";
import {
  planItemDefaults,
  planOptionLabel,
  requiresMembershipPlan,
  showsPlanSelector,
  type InvoicePlanOption,
} from "@/lib/billing/plan-item";

const plan: InvoicePlanOption = {
  id: "plan-1",
  name: "Gold",
  code: "GOLD-12",
  description: null,
  durationDays: 365,
  price: 12000,
  signupFee: 500,
  taxRate: 18,
};

describe("plan item helpers", () => {
  it("requires a plan only for membership item type", () => {
    expect(requiresMembershipPlan("membership")).toBe(true);
    expect(requiresMembershipPlan("renewal")).toBe(false);
    expect(requiresMembershipPlan("product")).toBe(false);
  });

  it("shows the plan selector for membership-related item types", () => {
    expect(showsPlanSelector("membership")).toBe(true);
    expect(showsPlanSelector("renewal")).toBe(true);
    expect(showsPlanSelector("upgrade")).toBe(true);
    expect(showsPlanSelector("product")).toBe(false);
  });

  it("fills description, snapshot rate, and plan tax from membership_plans", () => {
    expect(planItemDefaults(plan)).toEqual({
      description: "Gold · 365 days",
      unitPrice: "12000",
      taxRate: "18",
    });
  });

  it("prefers the plan description when present and keeps zero tax for GST master", () => {
    expect(
      planItemDefaults({
        ...plan,
        description: "Gold annual membership",
        taxRate: 0,
      }),
    ).toEqual({
      description: "Gold annual membership",
      unitPrice: "12000",
      taxRate: "",
    });
  });

  it("labels plans from live name, code, duration and price", () => {
    expect(planOptionLabel(plan, (value) => `₹${value}`)).toBe("Gold (GOLD-12) · 365 days · ₹12000");
  });
});
