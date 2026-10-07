/**
 * Unit tests for CRM form schemas.
 */

import { describe, expect, it } from "vitest";
import {
  convertLeadFormSchema,
  followUpFormSchema,
  leadFormSchema,
  referralFormSchema,
  trialFormSchema,
} from "@/lib/validation/crm-schemas";

describe("leadFormSchema", () => {
  const valid = {
    firstName: "Anita",
    lastName: "",
    email: "",
    phone: "9000000000",
    source: "walk-in",
    status: "new",
    interest: "",
    notes: "",
    branchId: "",
  };

  it("accepts a minimal lead", () => {
    expect(leadFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires first name", () => {
    expect(leadFormSchema.safeParse({ ...valid, firstName: "" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(leadFormSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });
});

describe("followUpFormSchema", () => {
  it("requires a due date and a lead or member", () => {
    const missing = followUpFormSchema.safeParse({
      leadId: "",
      memberId: "",
      branchId: "",
      dueAt: "",
      status: "pending",
      notes: "",
    });
    expect(missing.success).toBe(false);
  });

  it("accepts a lead follow-up", () => {
    const result = followUpFormSchema.safeParse({
      leadId: "lead-1",
      memberId: "",
      branchId: "",
      dueAt: "2026-10-08T10:00",
      status: "pending",
      notes: "",
    });
    expect(result.success).toBe(true);
  });
});

describe("trialFormSchema", () => {
  it("rejects an end date before start date", () => {
    const result = trialFormSchema.safeParse({
      branchId: "branch-1",
      leadId: "lead-1",
      memberId: "",
      startsOn: "2026-10-10",
      endsOn: "2026-10-01",
      status: "scheduled",
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("referralFormSchema", () => {
  it("requires a referrer and referred name", () => {
    expect(
      referralFormSchema.safeParse({
        referrerMemberId: "",
        referredName: "",
        referredPhone: "",
        referredEmail: "",
        status: "pending",
        reward: "",
        notes: "",
      }).success,
    ).toBe(false);
  });
});

describe("convertLeadFormSchema", () => {
  it("requires last name, phone digits and a branch", () => {
    expect(
      convertLeadFormSchema.safeParse({ branchId: "", lastName: "", phone: "123" }).success,
    ).toBe(false);
    expect(
      convertLeadFormSchema.safeParse({
        branchId: "branch-1",
        lastName: "Sharma",
        phone: "9000000000",
      }).success,
    ).toBe(true);
  });
});
