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
  organizationSettingsSchema,
  branchFormSchema,
  generalSettingsSchema,
  invoiceSettingsSchema,
  taxGstSettingsSchema,
} from "@/lib/validation/auth-schemas";

describe("loginSchema", () => {
  it("accepts a valid username and password and normalizes it", () => {
    const result = loginSchema.safeParse({
      username: "  Trainer.One ",
      password: "secret",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("trainer.one");
    }
  });

  it("rejects an empty password", () => {
    const result = loginSchema.safeParse({ username: "trainer", password: "" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues.some((i) => i.path[0] === "password")).toBe(true);
    }
  });

  it("rejects an empty username", () => {
    const result = loginSchema.safeParse({ username: "  ", password: "x" });
    expect(result.success).toBe(false);
  });
});

describe("signUpSchema", () => {
  const valid = {
    username: "asha.sharma",
    contactNumber: "9876543210",
    firstName: "Asha",
    lastName: "Sharma",
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

  it("normalizes username to lowercase and trims it", () => {
    const result = signUpSchema.safeParse({ ...valid, username: "  ASHA.Sharma " });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.username).toBe("asha.sharma");
    }
  });

  it("normalizes an Indian contact number to E.164", () => {
    const result = signUpSchema.safeParse({ ...valid, contactNumber: "98765 43210" });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.contactNumber).toBe("+919876543210");
    }
  });

  it("rejects an invalid username", () => {
    expect(signUpSchema.safeParse({ ...valid, username: "ab" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, username: "bad name" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, username: "admin" }).success).toBe(false);
  });

  it("rejects an invalid contact number", () => {
    expect(signUpSchema.safeParse({ ...valid, contactNumber: "12345" }).success).toBe(false);
    expect(signUpSchema.safeParse({ ...valid, contactNumber: "0123456789" }).success).toBe(false);
  });
});

describe("forgotPasswordSchema", () => {
  it("accepts a username", () => {
    expect(forgotPasswordSchema.safeParse({ username: "asha.sharma" }).success).toBe(true);
  });

  it("rejects an empty username", () => {
    expect(forgotPasswordSchema.safeParse({ username: "  " }).success).toBe(false);
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

  it("businessInfoSchema requires a business name and not regional preferences", () => {
    const valid = { name: "FitForge Indiranagar" };
    expect(businessInfoSchema.safeParse(valid).success).toBe(true);
    expect(businessInfoSchema.safeParse({ ...valid, name: "x" }).success).toBe(false);
    expect(businessInfoSchema.safeParse({ name: "FitForge" }).success).toBe(true);
  });

  it("businessInfoSchema allows an empty email", () => {
    const result = businessInfoSchema.safeParse({
      name: "FitForge",
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

describe("organizationSettingsSchema", () => {
  const valid = {
    name: "FitForge Indiranagar",
    currency: "INR",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    gstin: "",
  };

  it("accepts an empty GSTIN", () => {
    expect(organizationSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a 15-character alphanumeric GSTIN and uppercases it", () => {
    const result = organizationSettingsSchema.safeParse({
      ...valid,
      gstin: "29abcde1234f1z5",
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.gstin).toBe("29ABCDE1234F1Z5");
    }
  });

  it("rejects a GSTIN that is not 15 alphanumeric characters", () => {
    expect(
      organizationSettingsSchema.safeParse({ ...valid, gstin: "29ABC" }).success,
    ).toBe(false);
    expect(
      organizationSettingsSchema.safeParse({ ...valid, gstin: "29ABCDE1234F1Z!" }).success,
    ).toBe(false);
  });
});

describe("branchFormSchema", () => {
  const valid = {
    name: "Indiranagar",
    code: "INDIR",
    timezone: "Asia/Kolkata",
    gstin: "",
  };

  it("accepts a valid branch and an empty GSTIN", () => {
    expect(branchFormSchema.safeParse(valid).success).toBe(true);
  });

  it("validates branch code format", () => {
    expect(branchFormSchema.safeParse({ ...valid, code: "bad code!" }).success).toBe(false);
    expect(branchFormSchema.safeParse({ ...valid, code: "ok-code_2" }).success).toBe(true);
    expect(branchFormSchema.safeParse({ ...valid, code: "x" }).success).toBe(false);
  });

  it("rejects an invalid GSTIN", () => {
    expect(
      branchFormSchema.safeParse({ ...valid, gstin: "SHORT" }).success,
    ).toBe(false);
  });
});

describe("generalSettingsSchema", () => {
  it("requires currency, timezone and date format", () => {
    const valid = {
      currency: "INR",
      timezone: "Asia/Kolkata",
      dateFormat: "DD/MM/YYYY",
    };
    expect(generalSettingsSchema.safeParse(valid).success).toBe(true);
    expect(generalSettingsSchema.safeParse({ ...valid, currency: "" }).success).toBe(false);
  });
});

describe("invoiceSettingsSchema", () => {
  const valid = {
    prefix: "INV",
    nextNumber: 1,
    padding: 4,
    includeGstin: true,
    footerNote: "",
    terms: "",
  };

  it("accepts defaults", () => {
    expect(invoiceSettingsSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an empty prefix and a zero next number", () => {
    expect(invoiceSettingsSchema.safeParse({ ...valid, prefix: "" }).success).toBe(false);
    expect(invoiceSettingsSchema.safeParse({ ...valid, nextNumber: 0 }).success).toBe(false);
  });
});

describe("taxGstSettingsSchema", () => {
  it("allows an empty GSTIN when not registered", () => {
    expect(
      taxGstSettingsSchema.safeParse({
        gstRegistered: false,
        gstin: "",
        defaultGstRate: "18",
        hsnSac: "",
        placeOfSupply: "",
        reverseCharge: false,
      }).success,
    ).toBe(true);
  });

  it("requires a 15-character GSTIN when registered", () => {
    expect(
      taxGstSettingsSchema.safeParse({
        gstRegistered: true,
        gstin: "",
        defaultGstRate: "18",
        hsnSac: "",
        placeOfSupply: "",
        reverseCharge: false,
      }).success,
    ).toBe(false);
    expect(
      taxGstSettingsSchema.safeParse({
        gstRegistered: true,
        gstin: "29ABCDE1234F1Z5",
        defaultGstRate: "18",
        hsnSac: "",
        placeOfSupply: "Karnataka",
        reverseCharge: false,
      }).success,
    ).toBe(true);
  });
});
