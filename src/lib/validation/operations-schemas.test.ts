/**
 * Unit tests for Phase 3.2b operations form schemas.
 */

import { describe, expect, it } from "vitest";
import {
  attendanceFormSchema,
  bodyMeasurementFormSchema,
  classBookingFormSchema,
  classSessionFormSchema,
  dietPlanFormSchema,
  membershipFormSchema,
  membershipFreezeFormSchema,
  progressEntryFormSchema,
  ptSessionFormSchema,
  trainerAssignmentFormSchema,
  workoutPlanFormSchema,
} from "@/lib/validation/operations-schemas";

describe("membershipFormSchema", () => {
  const valid = {
    branchId: "11111111-1111-1111-1111-111111111111",
    memberId: "22222222-2222-2222-2222-222222222222",
    planId: "33333333-3333-3333-3333-333333333333",
    startDate: "2026-09-01",
    endDate: "2026-12-01",
    price: "12000",
    discount: "0",
    notes: "",
  };

  it("accepts a valid membership", () => {
    expect(membershipFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires member, plan and branch", () => {
    const result = membershipFormSchema.safeParse({
      ...valid,
      branchId: "",
      memberId: "",
      planId: "",
    });
    expect(result.success).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    const result = membershipFormSchema.safeParse({
      ...valid,
      startDate: "2026-12-01",
      endDate: "2026-09-01",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a negative price", () => {
    const result = membershipFormSchema.safeParse({ ...valid, price: "-1" });
    expect(result.success).toBe(false);
  });
});

describe("membershipFreezeFormSchema", () => {
  const valid = {
    membershipId: "11111111-1111-1111-1111-111111111111",
    startDate: "2026-09-01",
    endDate: "2026-09-10",
    reason: "Travel",
  };

  it("accepts a valid freeze", () => {
    expect(membershipFreezeFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires membership, start and end dates", () => {
    const result = membershipFreezeFormSchema.safeParse({
      membershipId: "",
      startDate: "",
      endDate: "",
      reason: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("attendanceFormSchema", () => {
  const valid = {
    branchId: "11111111-1111-1111-1111-111111111111",
    memberId: "22222222-2222-2222-2222-222222222222",
    checkInAt: "",
    checkOutAt: "",
    method: "manual" as const,
    notes: "",
  };

  it("accepts a minimal check-in", () => {
    expect(attendanceFormSchema.safeParse(valid).success).toBe(true);
  });

  it("rejects an invalid method", () => {
    const result = attendanceFormSchema.safeParse({ ...valid, method: "card" });
    expect(result.success).toBe(false);
  });
});

describe("trainerAssignmentFormSchema", () => {
  it("requires trainer and member", () => {
    const result = trainerAssignmentFormSchema.safeParse({
      trainerId: "",
      memberId: "",
      assignedAt: "",
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("ptSessionFormSchema", () => {
  const valid = {
    branchId: "11111111-1111-1111-1111-111111111111",
    trainerId: "22222222-2222-2222-2222-222222222222",
    memberId: "33333333-3333-3333-3333-333333333333",
    scheduledAt: "2026-09-17T10:00",
    durationMinutes: "60",
    notes: "",
  };

  it("accepts a valid session", () => {
    expect(ptSessionFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a positive duration", () => {
    const result = ptSessionFormSchema.safeParse({ ...valid, durationMinutes: "0" });
    expect(result.success).toBe(false);
  });
});

describe("classSessionFormSchema", () => {
  const valid = {
    branchId: "11111111-1111-1111-1111-111111111111",
    classTemplateId: "33333333-3333-3333-3333-333333333333",
    trainerId: "",
    startsAt: "2026-09-17T10:00",
    endsAt: "2026-09-17T11:00",
    capacity: "20",
    notes: "",
  };

  it("accepts a scheduled session", () => {
    expect(classSessionFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a class and start time", () => {
    const result = classSessionFormSchema.safeParse({
      ...valid,
      classTemplateId: "",
      startsAt: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("classBookingFormSchema", () => {
  const valid = {
    branchId: "11111111-1111-1111-1111-111111111111",
    memberId: "22222222-2222-2222-2222-222222222222",
    classSessionId: "44444444-4444-4444-4444-444444444444",
    classTemplateId: "",
    trainerId: "",
    startsAt: "2026-09-17T10:00",
    endsAt: "2026-09-17T11:00",
    capacity: "20",
    status: "booked" as const,
    notes: "",
  };

  it("accepts a booked class", () => {
    expect(classBookingFormSchema.safeParse(valid).success).toBe(true);
  });

  it("accepts a template-only booking when no session is selected", () => {
    expect(
      classBookingFormSchema.safeParse({
        ...valid,
        classSessionId: "",
        classTemplateId: "33333333-3333-3333-3333-333333333333",
      }).success,
    ).toBe(true);
  });

  it("rejects a booking without a session or template", () => {
    const result = classBookingFormSchema.safeParse({
      ...valid,
      classSessionId: "",
      classTemplateId: "",
    });
    expect(result.success).toBe(false);
  });

  it("accepts waitlisted status", () => {
    expect(classBookingFormSchema.safeParse({ ...valid, status: "waitlisted" }).success).toBe(true);
  });

  it("rejects end before start", () => {
    const result = classBookingFormSchema.safeParse({
      ...valid,
      startsAt: "2026-09-17T12:00",
      endsAt: "2026-09-17T11:00",
    });
    expect(result.success).toBe(false);
  });
});

describe("workoutPlanFormSchema", () => {
  const valid = {
    memberId: "11111111-1111-1111-1111-111111111111",
    trainerId: "",
    name: "Strength block",
    goal: "Strength",
    startDate: "",
    endDate: "",
    notes: "",
    isActive: true,
  };

  it("accepts a named plan", () => {
    expect(workoutPlanFormSchema.safeParse(valid).success).toBe(true);
  });

  it("requires a name and member", () => {
    const result = workoutPlanFormSchema.safeParse({ ...valid, name: "", memberId: "" });
    expect(result.success).toBe(false);
  });
});

describe("dietPlanFormSchema", () => {
  it("requires a name", () => {
    const result = dietPlanFormSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      trainerId: "",
      name: "",
      startDate: "",
      endDate: "",
      notes: "",
      isActive: true,
    });
    expect(result.success).toBe(false);
  });
});

describe("bodyMeasurementFormSchema", () => {
  it("accepts optional numeric fields", () => {
    const result = bodyMeasurementFormSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      measuredAt: "",
      weightKg: "72.5",
      heightCm: "",
      bodyFatPercent: "",
      chestCm: "",
      waistCm: "",
      hipsCm: "",
      armsCm: "",
      thighsCm: "",
      notes: "",
    });
    expect(result.success).toBe(true);
  });

  it("rejects a negative weight", () => {
    const result = bodyMeasurementFormSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      measuredAt: "",
      weightKg: "-1",
      heightCm: "",
      bodyFatPercent: "",
      chestCm: "",
      waistCm: "",
      hipsCm: "",
      armsCm: "",
      thighsCm: "",
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});

describe("progressEntryFormSchema", () => {
  it("rejects a non-http photo URL", () => {
    const result = progressEntryFormSchema.safeParse({
      memberId: "11111111-1111-1111-1111-111111111111",
      entryDate: "",
      weightKg: "",
      photoUrl: "ftp://example.com/photo.jpg",
      notes: "",
    });
    expect(result.success).toBe(false);
  });
});
