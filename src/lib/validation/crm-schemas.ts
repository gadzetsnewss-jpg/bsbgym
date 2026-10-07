/**
 * Zod schemas for CRM forms (leads, follow-ups, trials, referrals).
 * Field names match the resource form values; SECURITY DEFINER RPCs remain
 * the write path.
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

function endOnOrAfterStart(start: string, end: string) {
  if (!start || !end) return true;
  return end >= start;
}

export const LEAD_STATUSES = [
  { value: "new", label: "New" },
  { value: "contacted", label: "Contacted" },
  { value: "qualified", label: "Qualified" },
  { value: "trial", label: "Trial" },
  { value: "converted", label: "Converted" },
  { value: "lost", label: "Lost" },
] as const;

export const LEAD_FORM_STATUSES = LEAD_STATUSES.filter((item) => item.value !== "converted");

export const FOLLOW_UP_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "done", label: "Done" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const TRIAL_STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "active", label: "Active" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
] as const;

export const REFERRAL_STATUSES = [
  { value: "pending", label: "Pending" },
  { value: "converted", label: "Converted" },
  { value: "expired", label: "Expired" },
] as const;

export const leadFormSchema = z.object({
  firstName: requiredName("First name", 80),
  lastName: optionalText,
  email: optionalEmail,
  phone: optionalText,
  source: optionalText,
  status: z.enum(["new", "contacted", "qualified", "trial", "converted", "lost"]),
  interest: optionalText,
  notes: optionalLongText,
  branchId: z.string().optional().or(z.literal("")),
});

export const followUpFormSchema = z
  .object({
    leadId: z.string().optional().or(z.literal("")),
    memberId: z.string().optional().or(z.literal("")),
    branchId: z.string().optional().or(z.literal("")),
    dueAt: z.string().trim().min(1, "Due date is required"),
    status: z.enum(["pending", "done", "cancelled"]).optional().or(z.literal("")),
    notes: optionalLongText,
  })
  .refine((data) => Boolean(data.leadId) || Boolean(data.memberId), {
    message: "Select a lead or a member",
    path: ["leadId"],
  });

export const trialFormSchema = z
  .object({
    branchId: z.string().min(1, "Select a branch"),
    leadId: z.string().optional().or(z.literal("")),
    memberId: z.string().optional().or(z.literal("")),
    startsOn: z.string().trim().optional().or(z.literal("")),
    endsOn: z.string().trim().optional().or(z.literal("")),
    status: z.enum(["scheduled", "active", "completed", "cancelled"]).optional().or(z.literal("")),
    notes: optionalLongText,
  })
  .refine((data) => Boolean(data.leadId) || Boolean(data.memberId), {
    message: "Select a lead or a member",
    path: ["leadId"],
  })
  .refine((data) => endOnOrAfterStart(data.startsOn ?? "", data.endsOn ?? ""), {
    message: "End date cannot be before start date",
    path: ["endsOn"],
  });

export const referralFormSchema = z.object({
  referrerMemberId: z.string().min(1, "Select the referring member"),
  referredName: requiredName("Referred name", 160),
  referredPhone: optionalText,
  referredEmail: optionalEmail,
  status: z.enum(["pending", "converted", "expired"]).optional().or(z.literal("")),
  reward: optionalText,
  notes: optionalLongText,
});

export const convertLeadFormSchema = z.object({
  branchId: z.string().min(1, "Select a branch"),
  lastName: requiredName("Last name", 80),
  phone: z
    .string()
    .trim()
    .min(1, "Phone is required")
    .refine((value) => value.replace(/\D/g, "").length >= 8, "Phone must contain at least 8 digits"),
});
