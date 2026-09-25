/**
 * Zod schemas for Phase 3.2a catalog forms (trainers, plans, GST, exercises,
 * class templates, products, suppliers). Field names match the resource form
 * values; RPCs remain the write path.
 */

import { z } from "zod";

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));
const optionalLongText = z.string().trim().max(4000).optional().or(z.literal(""));
const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email")
  .optional()
  .or(z.literal(""));

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

export const EXERCISE_DIFFICULTIES = [
  { value: "", label: "Not specified" },
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
] as const;

export const trainerFormSchema = z.object({
  firstName: requiredName("First name", 80),
  lastName: requiredName("Last name", 80),
  code: z.string().trim().max(40).optional().or(z.literal("")),
  email: optionalEmail,
  phone: optionalText,
  specialization: optionalText,
  bio: optionalLongText,
  hourlyRate: optionalNumberField({ min: 0 }),
  joinedAt: z.string().trim().optional().or(z.literal("")),
  branchId: z.string().optional().or(z.literal("")),
});

export const membershipPlanFormSchema = z.object({
  name: requiredName("Plan name"),
  code: requiredName("Plan code", 40),
  description: optionalLongText,
  durationDays: numberField("Duration is required", { integer: true, gt: 0 }),
  price: numberField("Price is required", { min: 0 }),
  signupFee: numberField("Signup fee is required", { min: 0 }),
  taxRate: numberField("Tax rate is required", { min: 0 }),
  maxFreezeDays: numberField("Max freeze days is required", { integer: true, min: 0 }),
  sortOrder: numberField("Sort order is required", { integer: true }),
  isActive: z.boolean(),
});

export const gstRateFormSchema = z.object({
  name: requiredName("GST rate name"),
  rate: numberField("Rate is required", { min: 0 }),
  hsnSac: z.string().trim().max(20).optional().or(z.literal("")),
  isDefault: z.boolean(),
  isActive: z.boolean(),
});

export const exerciseFormSchema = z.object({
  name: requiredName("Exercise name"),
  category: optionalText,
  muscleGroup: optionalText,
  equipment: optionalText,
  difficulty: z.enum(["", "beginner", "intermediate", "advanced"]),
  instructions: optionalLongText,
  videoUrl: z
    .string()
    .trim()
    .max(500)
    .refine(
      (value) => value === "" || /^https?:\/\//i.test(value),
      "Enter a valid URL starting with http:// or https://",
    )
    .optional()
    .or(z.literal("")),
  isActive: z.boolean(),
});

export const classTemplateFormSchema = z.object({
  branchId: z.string().min(1, "Select a branch"),
  name: requiredName("Class name"),
  description: optionalLongText,
  durationMinutes: numberField("Duration is required", { integer: true, gt: 0 }),
  capacity: numberField("Capacity is required", { integer: true, min: 0 }),
  trainerId: z.string().optional().or(z.literal("")),
  isActive: z.boolean(),
});

export const productFormSchema = z.object({
  name: requiredName("Product name"),
  sku: z.string().trim().max(40).optional().or(z.literal("")),
  description: optionalLongText,
  category: optionalText,
  unit: z.string().trim().min(1, "Unit is required").max(20),
  costPrice: numberField("Cost price is required", { min: 0 }),
  salePrice: numberField("Sale price is required", { min: 0 }),
  taxRate: numberField("Tax rate is required", { min: 0 }),
  trackStock: z.boolean(),
  stockQuantity: numberField("Stock quantity is required", { min: 0 }),
  reorderLevel: numberField("Reorder level is required", { min: 0 }),
  isActive: z.boolean(),
});

export const supplierFormSchema = z.object({
  name: requiredName("Supplier name"),
  contactName: optionalText,
  email: optionalEmail,
  phone: optionalText,
  gstin: z.string().trim().max(15).optional().or(z.literal("")),
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
  notes: optionalLongText,
  isActive: z.boolean(),
});
