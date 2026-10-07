/**
 * CRM-module table adapters (Phase 6).
 *
 * Reads go through RLS-scoped selects. Writes go through the SECURITY DEFINER
 * RPCs in `20261007000028_crm_write_rpcs.sql`.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  createTableAdapter,
  datetimeOrNull,
  textOrNull,
  toDateTimeLocal,
} from "@/lib/org/crud-adapter";
import type { ResourceValues } from "@/lib/crud/types";
import type { SelectOption } from "@/components/ui/select";

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function embedName(value: unknown): string | null {
  if (!value) return null;
  const record = (Array.isArray(value) ? value[0] : value) as
    | {
        name?: string;
        code?: string;
        full_name?: string;
        first_name?: string;
        last_name?: string;
      }
    | null;
  if (!record) return null;
  if (record.full_name) return record.full_name;
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (record.name && record.code) return `${record.name} (${record.code})`;
  return record.name ?? null;
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export interface LeadRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  branchName: string | null;
  firstName: string;
  lastName: string | null;
  fullName: string;
  email: string | null;
  phone: string | null;
  source: string | null;
  status: string;
  interest: string | null;
  notes: string | null;
  assignedTo: string | null;
  convertedMemberId: string | null;
  convertedMemberName: string | null;
  createdAt: string;
}

export interface FollowUpRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  branchName: string | null;
  leadId: string | null;
  leadName: string | null;
  memberId: string | null;
  memberName: string | null;
  dueAt: string;
  status: string;
  notes: string | null;
  assignedTo: string | null;
}

export interface TrialRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string | null;
  leadId: string | null;
  leadName: string | null;
  memberId: string | null;
  memberName: string | null;
  startsOn: string;
  endsOn: string;
  status: string;
  notes: string | null;
}

export interface ReferralRow {
  id: string;
  organizationId: string;
  referrerMemberId: string;
  referrerName: string;
  referredName: string;
  referredPhone: string | null;
  referredEmail: string | null;
  status: string;
  reward: string | null;
  notes: string | null;
  createdAt: string;
}

export async function loadLeadOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("leads" as "gym_members")
    .select("id, full_name, first_name, last_name, status")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  return ((data ?? []) as unknown as Row[])
    .filter((row) => asString(row.status) !== "lost")
    .map((row) => {
      const name =
        asNullableString(row.full_name) ||
        [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(" ").trim() ||
        "Lead";
      return { value: asString(row.id), label: name };
    });
}

function leadParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_first_name: textOrNull(values.firstName) ?? "",
    p_last_name: textOrNull(values.lastName),
    p_email: textOrNull(values.email),
    p_phone: textOrNull(values.phone),
    p_source: textOrNull(values.source),
    p_status: textOrNull(values.status) ?? "new",
    p_interest: textOrNull(values.interest),
    p_notes: textOrNull(values.notes),
    p_assigned_to: null,
  };
}

export const leadAdapter = createTableAdapter<LeadRow>({
  table: "leads",
  select:
    "id, organization_id, branch_id, first_name, last_name, full_name, email, phone, source, status, interest, notes, assigned_to, converted_member_id, created_at, branches(id, name, code), gym_members(id, full_name, first_name, last_name)",
  searchColumns: ["full_name", "phone", "email", "source", "interest"],
  order: { column: "created_at", ascending: false },
  filterColumns: { status: "status" },
  mapRow: (row): LeadRow => {
    const firstName = asString(row.first_name);
    const lastName = asNullableString(row.last_name);
    return {
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      branchId: asNullableString(row.branch_id),
      branchName: embedName(row.branches),
      firstName,
      lastName,
      fullName:
        asNullableString(row.full_name) ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        "Lead",
      email: asNullableString(row.email),
      phone: asNullableString(row.phone),
      source: asNullableString(row.source),
      status: asString(row.status) || "new",
      interest: asNullableString(row.interest),
      notes: asNullableString(row.notes),
      assignedTo: asNullableString(row.assigned_to),
      convertedMemberId: asNullableString(row.converted_member_id),
      convertedMemberName: embedName(row.gym_members),
      createdAt: asString(row.created_at),
    };
  },
  toFormValues: (row): ResourceValues => ({
    firstName: row.firstName,
    lastName: row.lastName ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    source: row.source ?? "",
    status: row.status,
    interest: row.interest ?? "",
    notes: row.notes ?? "",
    branchId: row.branchId ?? "",
  }),
  rpcCreate: "create_lead",
  rpcUpdate: "update_lead",
  idUpdateParam: "p_lead_id",
  buildCreateParams: (values) => leadParams(values),
  buildUpdateParams: (values) => leadParams(values),
});

export const followUpAdapter = createTableAdapter<FollowUpRow>({
  table: "follow_ups",
  select:
    "id, organization_id, branch_id, lead_id, member_id, due_at, status, notes, assigned_to, branches(id, name, code), leads(id, full_name, first_name, last_name), gym_members(id, full_name, first_name, last_name)",
  searchColumns: ["notes"],
  order: { column: "due_at", ascending: true },
  filterColumns: { status: "status" },
  dueBucketFilters: { bucket: "due_at" },
  mapRow: (row): FollowUpRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asNullableString(row.branch_id),
    branchName: embedName(row.branches),
    leadId: asNullableString(row.lead_id),
    leadName: embedName(row.leads),
    memberId: asNullableString(row.member_id),
    memberName: embedName(row.gym_members),
    dueAt: asString(row.due_at),
    status: asString(row.status) || "pending",
    notes: asNullableString(row.notes),
    assignedTo: asNullableString(row.assigned_to),
  }),
  toFormValues: (row): ResourceValues => ({
    leadId: row.leadId ?? "",
    memberId: row.memberId ?? "",
    branchId: row.branchId ?? "",
    dueAt: toDateTimeLocal(row.dueAt),
    status: row.status,
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_follow_up",
  rpcUpdate: "update_follow_up",
  idUpdateParam: "p_follow_up_id",
  buildCreateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_lead_id: textOrNull(values.leadId),
    p_member_id: textOrNull(values.memberId),
    p_due_at: datetimeOrNull(values.dueAt),
    p_notes: textOrNull(values.notes),
    p_assigned_to: null,
  }),
  buildUpdateParams: (values) => ({
    p_due_at: datetimeOrNull(values.dueAt),
    p_status: textOrNull(values.status) ?? "pending",
    p_notes: textOrNull(values.notes),
    p_assigned_to: null,
  }),
});

export const trialAdapter = createTableAdapter<TrialRow>({
  table: "trial_memberships",
  select:
    "id, organization_id, branch_id, lead_id, member_id, starts_on, ends_on, status, notes, branches(id, name, code), leads(id, full_name, first_name, last_name), gym_members(id, full_name, first_name, last_name)",
  searchColumns: ["notes"],
  order: { column: "starts_on", ascending: false },
  filterColumns: { status: "status" },
  mapRow: (row): TrialRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches),
    leadId: asNullableString(row.lead_id),
    leadName: embedName(row.leads),
    memberId: asNullableString(row.member_id),
    memberName: embedName(row.gym_members),
    startsOn: asString(row.starts_on),
    endsOn: asString(row.ends_on),
    status: asString(row.status) || "scheduled",
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    branchId: row.branchId,
    leadId: row.leadId ?? "",
    memberId: row.memberId ?? "",
    startsOn: dateOnly(row.startsOn),
    endsOn: dateOnly(row.endsOn),
    status: row.status,
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_trial_membership",
  rpcUpdate: "update_trial_membership",
  idUpdateParam: "p_trial_id",
  buildCreateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_lead_id: textOrNull(values.leadId),
    p_member_id: textOrNull(values.memberId),
    p_starts_on: textOrNull(values.startsOn),
    p_ends_on: textOrNull(values.endsOn),
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_starts_on: textOrNull(values.startsOn),
    p_ends_on: textOrNull(values.endsOn),
    p_status: textOrNull(values.status) ?? "scheduled",
    p_notes: textOrNull(values.notes),
  }),
});

export const referralAdapter = createTableAdapter<ReferralRow>({
  table: "referrals",
  select:
    "id, organization_id, referrer_member_id, referred_name, referred_phone, referred_email, status, reward, notes, created_at, gym_members(id, full_name, first_name, last_name)",
  searchColumns: ["referred_name", "referred_phone", "referred_email"],
  order: { column: "created_at", ascending: false },
  filterColumns: { status: "status" },
  mapRow: (row): ReferralRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    referrerMemberId: asString(row.referrer_member_id),
    referrerName: embedName(row.gym_members) ?? "Member",
    referredName: asString(row.referred_name),
    referredPhone: asNullableString(row.referred_phone),
    referredEmail: asNullableString(row.referred_email),
    status: asString(row.status) || "pending",
    reward: asNullableString(row.reward),
    notes: asNullableString(row.notes),
    createdAt: asString(row.created_at),
  }),
  toFormValues: (row): ResourceValues => ({
    referrerMemberId: row.referrerMemberId,
    referredName: row.referredName,
    referredPhone: row.referredPhone ?? "",
    referredEmail: row.referredEmail ?? "",
    status: row.status,
    reward: row.reward ?? "",
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_referral",
  rpcUpdate: "update_referral",
  idUpdateParam: "p_referral_id",
  buildCreateParams: (values) => ({
    p_referrer_member_id: textOrNull(values.referrerMemberId),
    p_referred_name: textOrNull(values.referredName) ?? "",
    p_referred_phone: textOrNull(values.referredPhone),
    p_referred_email: textOrNull(values.referredEmail),
    p_reward: textOrNull(values.reward),
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_referred_name: textOrNull(values.referredName) ?? "",
    p_referred_phone: textOrNull(values.referredPhone),
    p_referred_email: textOrNull(values.referredEmail),
    p_status: textOrNull(values.status) ?? "pending",
    p_reward: textOrNull(values.reward),
    p_notes: textOrNull(values.notes),
  }),
});
