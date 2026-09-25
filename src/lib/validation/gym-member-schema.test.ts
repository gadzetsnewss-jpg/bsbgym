/**
 * Unit tests for the gym member validation schema (Phase 3.1).
 */

import { describe, expect, it } from "vitest";
import { gymMemberFormSchema, GYM_MEMBER_GENDERS } from "@/lib/validation/auth-schemas";

const valid = {
  firstName: "Asha",
  lastName: "Rao",
  phone: "+91 90000 00000",
  email: "",
  gender: "" as const,
  dateOfBirth: "",
  branchId: "branch-1",
  joinedAt: "",
  emergencyContactName: "",
  emergencyContactPhone: "",
  notes: "",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

describe("gymMemberFormSchema", () => {
  it("accepts a minimal valid member", () => {
    expect(gymMemberFormSchema.safeParse(valid).success).toBe(true);
  });

  it("normalizes the email to lowercase", () => {
    const result = gymMemberFormSchema.safeParse({
      ...valid,
      email: "  Member@Example.COM ",
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("member@example.com");
  });

  it("requires a first name, last name, phone and branch", () => {
    const result = gymMemberFormSchema.safeParse({
      ...valid,
      firstName: "",
      lastName: "",
      phone: "",
      branchId: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("firstName");
      expect(fields).toContain("lastName");
      expect(fields).toContain("phone");
      expect(fields).toContain("branchId");
    }
  });

  it("rejects a phone with fewer than 8 digits", () => {
    const result = gymMemberFormSchema.safeParse({ ...valid, phone: "12345" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid email when one is provided", () => {
    const result = gymMemberFormSchema.safeParse({ ...valid, email: "nope" });
    expect(result.success).toBe(false);
  });

  it("rejects a future date of birth", () => {
    const result = gymMemberFormSchema.safeParse({ ...valid, dateOfBirth: "2999-01-01" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown gender", () => {
    const result = gymMemberFormSchema.safeParse({ ...valid, gender: "robot" });
    expect(result.success).toBe(false);
  });

  it("exposes the gender options used by the form", () => {
    expect(GYM_MEMBER_GENDERS.map((option) => option.value)).toEqual([
      "",
      "male",
      "female",
      "other",
      "unspecified",
    ]);
  });
});
