/**
 * Zod validation schemas for authentication & onboarding (Phase 3).
 * Used by the auth/onboarding forms; shared between client pages and tests.
 */

import { z } from "zod";
import {
  normalizeContactNumber,
  normalizeUsername,
  usernameValidationMessage,
} from "@/lib/auth/username";

/* ---------------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------------- */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const usernameSchema = z
  .string()
  .trim()
  .transform(normalizeUsername)
  .superRefine((value, ctx) => {
    const message = usernameValidationMessage(value);
    if (message) ctx.addIssue({ code: "custom", message });
  });

const contactNumberSchema = z
  .string()
  .trim()
  .min(1, "Contact number is required")
  .transform((value, ctx) => {
    const normalized = normalizeContactNumber(value);
    if (!normalized) {
      ctx.addIssue({
        code: "custom",
        message: "Enter a valid 10-digit Indian mobile number",
      });
      return z.NEVER;
    }
    return normalized;
  });

const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

const loginUsernameSchema = z
  .string()
  .trim()
  .min(1, "Username is required")
  .transform(normalizeUsername);

export const loginSchema = z.object({
  username: loginUsernameSchema,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z
  .object({
    username: usernameSchema,
    contactNumber: contactNumberSchema,
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ username: loginUsernameSchema });

export const resetPasswordSchema = z
  .object({
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

/* ---------------------------------------------------------------------------
   Organization onboarding
   --------------------------------------------------------------------------- */

const optionalText = z.string().trim().max(500).optional().or(z.literal(""));

const addressSchema = z.object({
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
});

export const accountSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
});

export const businessInfoSchema = z
  .object({
    name: z.string().trim().min(2, "Business name is required").max(120),
    legalName: optionalText,
    businessType: optionalText,
    email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
    phone: optionalText,
    website: optionalText,
    addressLine1: optionalText,
    addressLine2: optionalText,
    city: optionalText,
    state: optionalText,
    postalCode: optionalText,
    country: optionalText,
    taxId: optionalText,
  })
  .merge(addressSchema.partial());

export const branchSchema = z
  .object({
    name: z.string().trim().min(2, "Branch name is required").max(120),
    code: z
      .string()
      .trim()
      .min(2, "Branch code is required")
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, dashes or underscores"),
    phone: optionalText,
    email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
    timezone: z.string().min(1, "Timezone is required"),
  })
  .merge(addressSchema.partial());

export const preferencesSchema = z.object({
  currency: z.string().min(1, "Currency is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.string().min(1, "Date format is required"),
});

export const onboardingStepSchemas = [
  accountSchema,
  businessInfoSchema,
  branchSchema,
  preferencesSchema,
] as const;

/* ---------------------------------------------------------------------------
   Profile
   --------------------------------------------------------------------------- */

export const profileSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: optionalText,
  preferences: z.record(z.string(), z.unknown()).optional(),
});

/* ---------------------------------------------------------------------------
   Invitations & user management
   --------------------------------------------------------------------------- */

export const inviteSchema = z.object({
  email: emailSchema,
  roleId: z.string().min(1, "Select a role"),
  accessAllBranches: z.boolean().default(true),
  branchIds: z.array(z.string()).default([]),
});

const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .refine(
    (value) => value === "" || /^[0-9A-Z]{15}$/.test(value),
    "GSTIN must be 15 alphanumeric characters",
  );

export const organizationSettingsSchema = z.object({
  name: z.string().trim().min(2, "Business name is required").max(120),
  legalName: optionalText,
  businessType: optionalText,
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
  phone: optionalText,
  website: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
  taxId: optionalText,
  gstin: gstinSchema,
  currency: z.string().min(1, "Currency is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.string().min(1, "Date format is required"),
  logoUrl: optionalText,
});

export const branchFormSchema = z
  .object({
    name: z.string().trim().min(2, "Branch name is required").max(120),
    code: z
      .string()
      .trim()
      .min(2, "Branch code is required")
      .max(20)
      .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, dashes or underscores"),
    phone: optionalText,
    email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
    gstin: gstinSchema,
    timezone: z.string().min(1, "Timezone is required"),
  })
  .merge(addressSchema.partial());

export const generalSettingsSchema = preferencesSchema;

export const invoiceSettingsSchema = z.object({
  prefix: z
    .string()
    .trim()
    .min(1, "Invoice prefix is required")
    .max(12)
    .regex(/^[A-Za-z0-9_-]+$/, "Only letters, numbers, dashes or underscores"),
  nextNumber: z.coerce.number().int().min(1, "Next number must be at least 1").max(99999999),
  padding: z.coerce.number().int().min(1, "Padding must be at least 1").max(8),
  includeGstin: z.boolean(),
  footerNote: z.string().trim().max(500),
  terms: z.string().trim().max(2000),
});

export const taxGstSettingsSchema = z
  .object({
    gstRegistered: z.boolean(),
    gstin: gstinSchema,
    defaultGstRate: z.enum(["0", "5", "12", "18", "28"]),
    hsnSac: z.string().trim().max(20),
    placeOfSupply: z.string().trim().max(80),
    reverseCharge: z.boolean(),
  })
  .refine((values) => !values.gstRegistered || values.gstin.length === 15, {
    message: "GSTIN is required when the organization is GST registered",
    path: ["gstin"],
  });

export const gymMemberFormSchema = z.object({
  firstName: z.string().trim().min(1, "First name is required").max(80),
  lastName: z.string().trim().min(1, "Last name is required").max(80),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine((value) => value.replace(/\D/g, "").length >= 8, "Phone must contain at least 8 digits"),
  email: z.string().trim().toLowerCase().email("Enter a valid email").optional().or(z.literal("")),
  gender: z.enum(["", "male", "female", "other", "unspecified"]),
  dateOfBirth: z
    .string()
    .trim()
    .refine(
      (value) => value === "" || (!Number.isNaN(Date.parse(value)) && new Date(value) <= new Date()),
      "Enter a valid date of birth in the past",
    )
    .optional()
    .or(z.literal("")),
  branchId: z.string().min(1, "Select a branch"),
  joinedAt: z.string().trim().optional().or(z.literal("")),
  emergencyContactName: optionalText,
  emergencyContactPhone: optionalText,
  notes: z.string().trim().max(2000).optional().or(z.literal("")),
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  state: optionalText,
  postalCode: optionalText,
  country: optionalText,
});

export const GYM_MEMBER_GENDERS = [
  { value: "", label: "Prefer not to say" },
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "unspecified", label: "Unspecified" },
] as const;

export const GST_RATES = [
  { value: "0", label: "0% — Exempt / Nil" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18%" },
  { value: "28", label: "28%" },
] as const;

/* ---------------------------------------------------------------------------
   Shared option sets (configurable data, not hardcoded business rules)
   --------------------------------------------------------------------------- */

export const CURRENCIES = [
  { value: "INR", label: "INR - Indian Rupee (₹)" },
  { value: "USD", label: "USD - US Dollar ($)" },
  { value: "EUR", label: "EUR - Euro (€)" },
  { value: "GBP", label: "GBP - British Pound (£)" },
  { value: "AUD", label: "AUD - Australian Dollar (A$)" },
  { value: "AED", label: "AED - UAE Dirham (AED)" },
  { value: "SGD", label: "SGD - Singapore Dollar (S$)" },
  { value: "CAD", label: "CAD - Canadian Dollar (C$)" },
] as const;

export const DATE_FORMATS = [
  { value: "DD/MM/YYYY", label: "DD/MM/YYYY" },
  { value: "MM/DD/YYYY", label: "MM/DD/YYYY" },
  { value: "YYYY-MM-DD", label: "YYYY-MM-DD" },
] as const;

export const TIMEZONES = [
  { value: "Asia/Kolkata", label: "(GMT+5:30) India - Kolkata" },
  { value: "Asia/Dubai", label: "(GMT+4) UAE - Dubai" },
  { value: "Asia/Singapore", label: "(GMT+8) Singapore" },
  { value: "America/New_York", label: "(GMT-5) US - New York" },
  { value: "America/Los_Angeles", label: "(GMT-8) US - Los Angeles" },
  { value: "Europe/London", label: "(GMT+0) UK - London" },
  { value: "Europe/Berlin", label: "(GMT+1) Germany - Berlin" },
  { value: "Australia/Sydney", label: "(GMT+10) Australia - Sydney" },
] as const;

export const COUNTRIES = [
  { value: "IN", label: "India" },
  { value: "AE", label: "United Arab Emirates" },
  { value: "SG", label: "Singapore" },
  { value: "US", label: "United States" },
  { value: "GB", label: "United Kingdom" },
  { value: "DE", label: "Germany" },
  { value: "AU", label: "Australia" },
] as const;
