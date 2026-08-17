/**
 * Unit tests for the auth & onboarding validation schemas (Phase 3).
 */

import { describe, expect, it } from "vitest";
import {
  loginSchema,
  signUpSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  accountSchema,
  businessInfoSchema,
  branchSchema,
  preferencesSchema,
  profileSchema,
  inviteSchema,
} from "@/lib/validation/auth-schemas";

describe("loginSchema", () => {
  it("accepts a valid email and password", () => {
    const result = loginSchema.safeParse({
      email: "  Trainer@Example.com ",
      password: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("trainer@example.com");
    }
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "password")).toBe(true);
    }
  });

  it("rejects an invalid email", () => {
    const result = loginSchema.safeParse({ email: "not-an-email", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const valid = {
    firstName: "Asha",
    lastName: "Sharma",
    email: "asha@example.com",
    password: "gymPass99",
    confirmPassword: "gymPass99",
  };

  it("accepts a valid sign-up", () => {
    expect(signUpSchema.safeParse(valid).success).toBe(true);
  });

  it("requires both names", () => {
    const result = signUpSchema.safeParse({ ...valid, firstName: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "firstName")).toBe(true);
    }
  });

  it("rejects a password without a number", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "onlyletters",
      confirmPassword: "onlyletters",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(
        result.error.issues.some((i) => i.path[0] === "password"),
      ).toBe(true);
    }
  });

  it("rejects a password without a letter", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "12345678",
      confirmPassword: "12345678",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a short password", () => {
    const result = signUpSchema.safeParse({
      ...valid,
      password: "a1",
      confirmPassword: "a1",
    });
    expect(result.success).toBe(false);
  });

  it("rejects mismatched passwords on confirmPassword path", () => {
    const result = signUpSchema.safeParse({ ...valid, confirmPassword: "different99" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "confirmPassword")).toBe(true);
    }
  });

  it("normalizes email to lowercase and trims it", () => {
    const result = signUpSchema.safeParse({ ...valid, email: "  ASHA@Example.COM " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.email).toBe("asha@example.com");
    }
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a valid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "a@b.com" }).success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });
});

describe("resetPasswordSchema", () => {
  const valid = { password: "NewPass123", confirmPassword: "NewPass123" };

  it("accepts a valid strong password", () => {
    expect(resetPasswordSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects mismatched confirmation", () => {
    const result = resetPasswordSchema.safeParse({
      password: "NewPass123",
      confirmPassword: "OtherPass123",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "confirmPassword")).toBe(true);
    }
  });
});

describe("onboarding schemas", () => {
  it("accountSchema requires first and last name", () => {
    expect(accountSchema.safeParse({ firstName: "A", lastName: "B" }).success).toBe(true);
    expect(accountSchema.safeParse({ firstName: "", lastName: "B" }).success).toBe(false);
  });

  it("businessInfoSchema requires name, currency, timezone and dateFormat", () => {
    const valid = {
      name: "FitForge Indiranagar",
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
    };
    expect(businessInfoSchema.safeParse(valid).success).toBe(true);
    expect(businessInfoSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    expect(businessInfoSchema.safeParse({ ...valid, currency: "" }).success).toBe(false);
  });

  it("businessInfoSchema allows an empty email", () => {
    const result = businessInfoSchema.safeParse({
      name: "FitForge",
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
      email: "",
    });
    expect(result.success).toBe(true);
  });

  it("branchSchema validates the branch code format", () => {
    const base = { name: "Main", code: "MAIN", timezone: "Asia/Kolkata" };
    expect(branchSchema.safeParse(base).success).toBe(true);
    expect(
      branchSchema.safeParse({ ...base, code: "bad code!" }).success,
    ).toBe(false);
    expect(branchSchema.safeParse({ ...base, code: "ok-code_2" }).success).toBe(true);
    expect(branchSchema.safeParse({ ...base, code: "x" }).success).toBe(false);
  });

  it("preferencesSchema requires all regional fields", () => {
    const valid = {
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
    };
    expect(preferencesSchema.safeParse(valid).success).toBe(true);
    expect(preferencesSchema.safeParse({ ...valid, timezone: "" }).success).toBe(false);
  });
});

describe("profileSchema", () => {
  it("accepts a valid profile and trims names", () => {
    const result = profileSchema.safeParse({
      firstName: "  Asha ",
      lastName: " Sharma",
      phone: "",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.firstName).toBe("Asha");
      expect(result.data.lastName).toBe("Sharma");
    }
  });

  it("rejects empty names", () => {
    expect(profileSchema.safeParse({ firstName: "", lastName: "" }).success).toBe(false);
  });
});

describe("inviteSchema", () => {
  it("defaults to all-branches access", () => {
    const result = inviteSchema.safeParse({
      email: "trainer@example.com",
      roleId: "role-id",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.accessAllBranches).toBe(true);
      expect(result.data.branchIds).toEqual([]);
    }
  });

  it("accepts specific branch access", () => {
    const result = inviteSchema.safeParse({
      email: "trainer@example.com",
      roleId: "role-id",
      accessAllBranches: false,
      branchIds: ["b1", "b2"],
    });
    expect(result.success).toBe(true);
  });

  it("rejects an invalid email", () => {
    expect(
      inviteSchema.safeParse({ email: "bad", roleId: "r" }).success,
    ).toBe(false);
  });
});
