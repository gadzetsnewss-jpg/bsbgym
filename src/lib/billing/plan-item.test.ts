import { describe, expect, it } from "vitest";
import {
  addMonthsIso,
  computeBaseEndDate,
  computeValidityEnd,
  daysBetweenIso,
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

  it("computes an inclusive base end date from the plan duration", () => {
    expect(computeBaseEndDate("2026-10-01", 365)).toBe("2027-09-30");
    expect(computeBaseEndDate("2026-10-01", 30)).toBe("2026-10-30");
    expect(computeBaseEndDate("2026-10-01", 1)).toBe("2026-10-01");
  });

  it("adds extra validity months and days", () => {
    expect(computeValidityEnd("2026-10-01", 365, 5, 0)).toBe("2028-02-29");
    expect(computeValidityEnd("2026-10-01", 365, 0, 10)).toBe("2027-10-10");
    expect(addMonthsIso("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("measures day gaps for extending an active membership", () => {
    expect(daysBetweenIso("2027-09-30", "2028-02-29")).toBe(152);
  });
});
