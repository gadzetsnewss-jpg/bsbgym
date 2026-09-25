/**
 * Zod schemas for Phase 3.2b operations forms. Field names match the resource
 * form values; SECURITY DEFINER RPCs remain the write path.
 */

import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));
const optionalLongText = z.string().trim().max(4000).optional().or(z.literal(""));

function requiredName(label: string, max = 120) {
  return z.string().trim().min(1, `${label} is required`).max(max);
}

function numberField(
  requiredMessage: string,
  opts: { min?: number; gt?: number; integer?: boolean } = {},
) {
  return z
    .string()
    .trim()
    .min(1, requiredMessage)
    .refine((value) => !Number.isNaN(Number(value)), "Enter a valid number")
    .refine(
      (value) => !opts.integer || Number.isInteger(Number(value)),
      "Enter a whole number",
    )
    .refine(
      (value) => opts.min === undefined || Number(value) >= opts.min,
      "Cannot be negative",
    )
    .refine(
      (value) => opts.gt === undefined || Number(value) > opts.gt,
      "Must be greater than zero",
    );
}

function optionalNumberField(opts: { min?: number } = {}) {
  return z
    .string()
    .trim()
    .refine((value) => value === "" || !Number.isNaN(Number(value)), "Enter a valid number")
    .refine(
      (value) => value === "" || opts.min === undefined || Number(value) >= opts.min,
      "Cannot be negative",
    )
    .optional()
    .or(z.literal(""));
}

function endOnOrAfterStart(start: string, end: string) {
  if (!start || !end) return true;
  return end >= start;
}

export const MEMBERSHIP_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const ATTENDANCE_METHODS = [
  { value: "manual", label: "Manual" },
  { value: "qr", label: "QR" },
  { value: "biometric", label: "Biometric" },
  { value: "app", label: "App" },
] as const;

export const PT_SESSION_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
  { value: "no_show", label: "No show" },
] as const;

export const BOOKING_STATUSES = [
  { value: "booked", label: "Booked" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "attended", label: "Attended" },
  { value: "no_show", label: "No show" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const membershipFormSchema = z
  .object({
    branchId: z.string().min(1, "Select a branch"),
    memberId: z.string().min(1, "Select a member"),
    planId: z.string().min(1, "Select a plan"),
    startDate: z.string().trim().optional().or(z.literal("")),
    endDate: z.string().trim().optional().or(z.literal("")),
    price: optionalNumberField({ min: 0 }),
    discount: optionalNumberField({ min: 0 }),
    notes: optionalLongText,
  })
  .refine((data) => endOnOrAfterStart(data.startDate ?? "", data.endDate ?? ""), {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

export const membershipFreezeFormSchema = z
  .object({
    membershipId: z.string().min(1, "Select a membership"),
    startDate: z.string().trim().min(1, "Start date is required"),
    endDate: z.string().trim().min(1, "End date is required"),
    reason: optionalLongText,
  })
  .refine((data) => endOnOrAfterStart(data.startDate, data.endDate), {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

export const attendanceFormSchema = z.object({
  branchId: z.string().min(1, "Select a branch"),
  memberId: z.string().min(1, "Select a member"),
  checkInAt: z.string().trim().optional().or(z.literal("")),
  checkOutAt: z.string().trim().optional().or(z.literal("")),
  method: z.enum(["manual", "qr", "biometric", "app"]),
  notes: optionalLongText,
});

export const trainerAssignmentFormSchema = z.object({
  trainerId: z.string().min(1, "Select a trainer"),
  memberId: z.string().min(1, "Select a member"),
  assignedAt: z.string().trim().optional().or(z.literal("")),
  notes: optionalLongText,
});

export const ptSessionFormSchema = z.object({
  branchId: z.string().min(1, "Select a branch"),
  trainerId: z.string().min(1, "Select a trainer"),
  memberId: z.string().min(1, "Select a member"),
  scheduledAt: z.string().trim().min(1, "Scheduled time is required"),
  durationMinutes: numberField("Duration is required", { integer: true, gt: 0 }),
  notes: optionalLongText,
});

export const classBookingFormSchema = z
  .object({
    branchId: z.string().min(1, "Select a branch"),
    memberId: z.string().min(1, "Select a member"),
    classTemplateId: z.string().min(1, "Select a class"),
    trainerId: z.string().optional().or(z.literal("")),
    startsAt: z.string().trim().optional().or(z.literal("")),
    endsAt: z.string().trim().optional().or(z.literal("")),
    capacity: optionalNumberField({ min: 0 }),
    status: z.enum(["booked", "waitlisted", "attended", "no_show", "cancelled"]),
    notes: optionalLongText,
  })
  .refine((data) => endOnOrAfterStart(data.startsAt ?? "", data.endsAt ?? ""), {
    message: "End time cannot be before start time",
    path: ["endsAt"],
  });

export const workoutPlanFormSchema = z
  .object({
    memberId: z.string().min(1, "Select a member"),
    trainerId: z.string().optional().or(z.literal("")),
    name: requiredName("Plan name"),
    goal: optionalText,
    startDate: z.string().trim().optional().or(z.literal("")),
    endDate: z.string().trim().optional().or(z.literal("")),
    notes: optionalLongText,
    isActive: z.boolean(),
  })
  .refine((data) => endOnOrAfterStart(data.startDate ?? "", data.endDate ?? ""), {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

export const dietPlanFormSchema = z
  .object({
    memberId: z.string().min(1, "Select a member"),
    trainerId: z.string().optional().or(z.literal("")),
    name: requiredName("Plan name"),
    startDate: z.string().trim().optional().or(z.literal("")),
    endDate: z.string().trim().optional().or(z.literal("")),
    notes: optionalLongText,
    isActive: z.boolean(),
  })
  .refine((data) => endOnOrAfterStart(data.startDate ?? "", data.endDate ?? ""), {
    message: "End date cannot be before start date",
    path: ["endDate"],
  });

export const bodyMeasurementFormSchema = z.object({
  memberId: z.string().min(1, "Select a member"),
  measuredAt: z.string().trim().optional().or(z.literal("")),
  weightKg: optionalNumberField({ min: 0 }),
  heightCm: optionalNumberField({ min: 0 }),
  bodyFatPercent: optionalNumberField({ min: 0 }),
  chestCm: optionalNumberField({ min: 0 }),
  waistCm: optionalNumberField({ min: 0 }),
  hipsCm: optionalNumberField({ min: 0 }),
  armsCm: optionalNumberField({ min: 0 }),
  thighsCm: optionalNumberField({ min: 0 }),
  notes: optionalLongText,
});

export const progressEntryFormSchema = z.object({
  memberId: z.string().min(1, "Select a member"),
  entryDate: z.string().trim().optional().or(z.literal("")),
  weightKg: optionalNumberField({ min: 0 }),
  photoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === "" || /^https?:\/\//i.test(value),
      "Enter a valid URL starting with http:// or https://",
    )
    .optional()
    .or(z.literal("")),
  notes: optionalLongText,
});
