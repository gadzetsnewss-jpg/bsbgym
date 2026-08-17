/**
 * Zod validation schemas for authentication & onboarding (Phase 3).
 * Used by the auth/onboarding forms; shared between client pages and tests.
 */

import { z } from "zod";

/* ---------------------------------------------------------------------------
   Auth
   --------------------------------------------------------------------------- */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Email is required")
  .email("Enter a valid email address");

const strongPasswordSchema = z
  .string()
  .min(8, "Password must be at least 8 characters")
  .regex(/[A-Za-z]/, "Password must contain at least one letter")
  .regex(/[0-9]/, "Password must contain at least one number");

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Password is required"),
});

export const signUpSchema = z
  .object({
    firstName: z.string().trim().min(1, "First name is required").max(80),
    lastName: z.string().trim().min(1, "Last name is required").max(80),
    email: emailSchema,
    password: strongPasswordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const forgotPasswordSchema = z.object({ email: emailSchema });

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
    currency: z.string().min(1, "Currency is required"),
    timezone: z.string().min(1, "Timezone is required"),
    dateFormat: z.string().min(1, "Date format is required"),
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
