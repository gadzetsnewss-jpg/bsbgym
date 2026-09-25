/**
 * Unit tests for Phase 3.2a catalog form schemas.
 */

import { describe, expect, it } from "vitest";
import {
  classTemplateFormSchema,
  exerciseFormSchema,
  gstRateFormSchema,
  membershipPlanFormSchema,
  productFormSchema,
  supplierFormSchema,
  trainerFormSchema,
} from "@/lib/validation/catalog-schemas";

describe("trainerFormSchema", () => {
  const valid = {
    firstName: "Priya",
    lastName: "Shah",
    code: "T-01",
    email: "",
    phone: "",
    specialization: "",
    bio: "",
    hourlyRate: "",
    joinedAt: "",
    branchId: "",
  };

  it("accepts a minimal trainer", () => {
    expect(trainerFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires first and last name", () => {
    const result = trainerFormSchema.safeParse({ ...valid, firstName: "", lastName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a negative hourly rate", () => {
    const result = trainerFormSchema.safeParse({ ...valid, hourlyRate: "-1" });
    expect(result.success).toBe(false);
  });

  it("normalizes email to lowercase", () => {
    const result = trainerFormSchema.safeParse({ ...valid, email: "  Coach@Example.COM " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("coach@example.com");
  });
});

describe("membershipPlanFormSchema", () => {
  const valid = {
    name: "Gold 12",
    code: "GOLD-12",
    description: "",
    durationDays: "365",
    price: "12000",
    signupFee: "0",
    taxRate: "18",
    maxFreezeDays: "30",
    sortOrder: "0",
    isActive: true,
  };

  it("accepts a valid plan", () => {
    expect(membershipPlanFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name, code and positive duration", () => {
    const result = membershipPlanFormSchema.safeParse({
      ...valid,
      name: "",
      code: "",
      durationDays: "0",
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      const fields = result.error.issues.map((issue) => issue.path[0]);
      expect(fields).toContain("name");
      expect(fields).toContain("code");
      expect(fields).toContain("durationDays");
    }
  });

  it("rejects negative amounts", () => {
    expect(membershipPlanFormSchema.safeParse({ ...valid, price: "-10" }).success).toBe(false);
  });
});

describe("gstRateFormSchema", () => {
  it("accepts a named rate", () => {
    expect(
      gstRateFormSchema.safeParse({
        name: "GST 18%",
        rate: "18",
        hsnSac: "",
        isDefault: false,
        isActive: true,
      }).success,
    ).toBe(true);
  });

  it("rejects a missing name or negative rate", () => {
    expect(
      gstRateFormSchema.safeParse({
        name: "",
        rate: "-1",
        hsnSac: "",
        isDefault: false,
        isActive: true,
      }).success,
    ).toBe(false);
  });
});

describe("exerciseFormSchema", () => {
  const valid = {
    name: "Bench press",
    category: "Strength",
    muscleGroup: "Chest",
    equipment: "Barbell",
    difficulty: "intermediate" as const,
    instructions: "",
    videoUrl: "",
    isActive: true,
  };

  it("accepts a valid exercise", () => {
    expect(exerciseFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an unknown difficulty", () => {
    const result = exerciseFormSchema.safeParse({ ...valid, difficulty: "elite" });
    expect(result.success).toBe(false);
  });

  it("rejects a non-http video URL", () => {
    const result = exerciseFormSchema.safeParse({ ...valid, videoUrl: "ftp://example.com" });
    expect(result.success).toBe(false);
  });
});

describe("classTemplateFormSchema", () => {
  const valid = {
    branchId: "branch-1",
    name: "Yoga flow",
    description: "",
    durationMinutes: "60",
    capacity: "20",
    trainerId: "",
    isActive: true,
  };

  it("accepts a valid class", () => {
    expect(classTemplateFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a branch, name and positive duration", () => {
    const result = classTemplateFormSchema.safeParse({
      ...valid,
      branchId: "",
      name: "",
      durationMinutes: "0",
    });
    expect(result.success).toBe(false);
  });
});

describe("productFormSchema", () => {
  const valid = {
    name: "Whey protein",
    sku: "WHEY-1",
    description: "",
    category: "Supplements",
    unit: "pcs",
    costPrice: "800",
    salePrice: "1200",
    taxRate: "18",
    trackStock: true,
    stockQuantity: "10",
    reorderLevel: "2",
    isActive: true,
  };

  it("accepts a valid product", () => {
    expect(productFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects negative prices or stock", () => {
    expect(productFormSchema.safeParse({ ...valid, salePrice: "-1" }).success).toBe(false);
    expect(productFormSchema.safeParse({ ...valid, stockQuantity: "-1" }).success).toBe(false);
  });
});

describe("supplierFormSchema", () => {
  const valid = {
    name: "Fit Supplies",
    contactName: "",
    email: "",
    phone: "",
    gstin: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    notes: "",
    isActive: true,
  };

  it("accepts a minimal supplier", () => {
    expect(supplierFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name and a valid email when provided", () => {
    expect(supplierFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(supplierFormSchema.safeParse({ ...valid, email: "nope" }).success).toBe(false);
  });
});
