/**
 * Operations-module table adapters (Phase 3.2b).
 *
 * Reads go through RLS-scoped selects. Writes go through the SECURITY DEFINER
 * RPCs in `20260916000013_phase_3_2b_operations_rpcs.sql`.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  booleanValue,
  createTableAdapter,
  datetimeOrNull,
  numberOrNull,
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

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
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

function numberString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

function dateOnly(value: string | null | undefined): string {
  if (!value) return "";
  return value.length >= 10 ? value.slice(0, 10) : value;
}

export interface MembershipRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string;
  memberName: string;
  planId: string;
  planName: string;
  status: string;
  startDate: string;
  endDate: string;
  price: number;
  discount: number;
  finalAmount: number;
  freezeDaysUsed: number;
  planDurationDays: number;
  planMaxFreezeDays: number;
  notes: string | null;
}

export interface MembershipFreezeRow {
  id: string;
  organizationId: string;
  membershipId: string;
  memberName: string;
  planName: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string | null;
}

export interface AttendanceRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string;
  memberName: string;
  checkInAt: string;
  checkOutAt: string | null;
  method: string;
  notes: string | null;
}

export interface TrainerAssignmentRow {
  id: string;
  organizationId: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  assignedAt: string;
  status: string;
  notes: string | null;
}

export interface PtSessionRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  trainerId: string;
  trainerName: string;
  memberId: string;
  memberName: string;
  scheduledAt: string;
  durationMinutes: number;
  status: string;
  notes: string | null;
}

export interface ClassSessionRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  classTemplateId: string;
  className: string;
  trainerId: string | null;
  trainerName: string | null;
  startsAt: string;
  endsAt: string;
  capacity: number;
  status: string;
  notes: string | null;
}

export interface ClassBookingRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string;
  memberName: string;
  classSessionId: string;
  classTemplateId: string | null;
  className: string;
  trainerId: string | null;
  trainerName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  capacity: number | null;
  status: string;
  notes: string | null;
}

export interface WorkoutPlanRow {
  id: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  trainerId: string | null;
  trainerName: string | null;
  name: string;
  goal: string | null;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface DietPlanRow {
  id: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  trainerId: string | null;
  trainerName: string | null;
  name: string;
  startDate: string | null;
  endDate: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface BodyMeasurementRow {
  id: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  measuredAt: string;
  weightKg: number | null;
  heightCm: number | null;
  bodyFatPercent: number | null;
  chestCm: number | null;
  waistCm: number | null;
  hipsCm: number | null;
  armsCm: number | null;
  thighsCm: number | null;
  notes: string | null;
}

export interface ProgressEntryRow {
  id: string;
  organizationId: string;
  memberId: string;
  memberName: string;
  entryDate: string;
  weightKg: number | null;
  photoUrl: string | null;
  notes: string | null;
}

export async function loadMemberOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("gym_members")
    .select("id, full_name, first_name, last_name, code, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("first_name", { ascending: true });
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const name =
      asNullableString(row.full_name) ||
      [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(" ").trim() ||
      asNullableString(row.code) ||
      "Member";
    return { value: asString(row.id), label: name };
  });
}

export async function loadPlanOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("membership_plans" as "gym_members")
    .select("id, name, code, is_active, duration_days")
    .eq("organization_id", organizationId);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => asBoolean(row.is_active, true))
    .map((row) => {
      const name = asString(row.name);
      const code = asNullableString(row.code);
      const duration = asNumber(row.duration_days);
      const base = code ? `${name} (${code})` : name;
      return {
        value: asString(row.id),
        label: duration > 0 ? `${base} · ${duration} days` : base,
      };
    });
}

export async function loadClassSessionOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("class_sessions" as "gym_members")
    .select(
      "id, starts_at, ends_at, status, capacity, class_templates(name), trainers(full_name, first_name, last_name)",
    )
    .eq("organization_id", organizationId)
    .eq("status" as "id", "scheduled")
    .order("starts_at" as "created_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => asString(row.status) === "scheduled")
    .map((row) => {
      const template = Array.isArray(row.class_templates) ? row.class_templates[0] : row.class_templates;
      const name = embedName(template) ?? "Class";
      const when = asString(row.starts_at);
      const labelWhen = when.length >= 16 ? when.slice(0, 16).replace("T", " ") : when;
      return {
        value: asString(row.id),
        label: labelWhen ? `${name} · ${labelWhen}` : name,
      };
    });
}

export async function loadClassTemplateOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("class_templates" as "gym_members")
    .select("id, name, is_active")
    .eq("organization_id", organizationId);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => asBoolean(row.is_active, true))
    .map((row) => ({
      value: asString(row.id),
      label: asString(row.name),
    }));
}

export async function loadMembershipOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("memberships" as "gym_members")
    .select(
      "id, status, end_date, gym_members(full_name, first_name, last_name, code), membership_plans(name, code)",
    )
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("end_date", { ascending: true });
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const member = embedName(row.gym_members) ?? "Member";
    const plan = embedName(row.membership_plans);
    const end = dateOnly(asNullableString(row.end_date));
    return {
      value: asString(row.id),
      label: plan ? `${member} — ${plan}${end ? ` (ends ${end})` : ""}` : member,
    };
  });
}

const membershipSelect =
  "id, organization_id, branch_id, member_id, plan_id, status, start_date, end_date, price, discount, final_amount, freeze_days_used, notes, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code), membership_plans(id, name, code, duration_days, max_freeze_days)";

function embedRecord(value: unknown): Row | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Row | null;
}

function mapMembershipRow(row: Row): MembershipRow {
  const plan = embedRecord(row.membership_plans);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    planId: asString(row.plan_id),
    planName: embedName(row.membership_plans) ?? "Plan",
    status: asString(row.status) || "active",
    startDate: asString(row.start_date),
    endDate: asString(row.end_date),
    price: asNumber(row.price),
    discount: asNumber(row.discount),
    finalAmount: asNumber(row.final_amount),
    freezeDaysUsed: asNumber(row.freeze_days_used),
    planDurationDays: asNumber(plan?.duration_days),
    planMaxFreezeDays: asNumber(plan?.max_freeze_days),
    notes: asNullableString(row.notes),
  };
}

function membershipFormValues(row: MembershipRow): ResourceValues {
  return {
    branchId: row.branchId,
    memberId: row.memberId,
    planId: row.planId,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    price: numberString(row.price, "0"),
    discount: numberString(row.discount, "0"),
    notes: row.notes ?? "",
    status: row.status,
    freezeDaysUsed: numberString(row.freezeDaysUsed, "0"),
  };
}

function membershipCreateParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_member_id: textOrNull(values.memberId),
    p_plan_id: textOrNull(values.planId),
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_price: numberOrNull(values.price),
    p_discount: numberOrNull(values.discount),
    p_notes: textOrNull(values.notes),
  };
}

function membershipUpdateParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_plan_id: textOrNull(values.planId),
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_price: numberOrNull(values.price) ?? 0,
    p_discount: numberOrNull(values.discount) ?? 0,
    p_notes: textOrNull(values.notes),
  };
}

export const membershipAdapter = createTableAdapter<MembershipRow>({
  table: "memberships",
  select: membershipSelect,
  searchColumns: ["notes"],
  order: { column: "end_date", ascending: false },
  filterColumns: { status: "status" },
  mapRow: mapMembershipRow,
  toFormValues: membershipFormValues,
  rpcCreate: "create_membership",
  rpcUpdate: "update_membership",
  idUpdateParam: "p_membership_id",
  buildCreateParams: (values) => membershipCreateParams(values),
  buildUpdateParams: (values) => membershipUpdateParams(values),
});

export const activeMembershipAdapter = createTableAdapter<MembershipRow>({
  table: "memberships",
  select: membershipSelect,
  searchColumns: ["notes"],
  order: { column: "end_date" },
  filterColumns: { status: "status" },
  fixedEq: { status: "active" },
  mapRow: mapMembershipRow,
  toFormValues: membershipFormValues,
  rpcCreate: "create_membership",
  rpcUpdate: "update_membership",
  idUpdateParam: "p_membership_id",
  buildCreateParams: (values) => membershipCreateParams(values),
  buildUpdateParams: (values) => membershipUpdateParams(values),
});

export const renewalMembershipAdapter = createTableAdapter<MembershipRow>({
  table: "memberships",
  select: membershipSelect,
  searchColumns: ["notes"],
  order: { column: "end_date" },
  filterColumns: { status: "status" },
  fixedEq: { status: "active" },
  lteColumnDays: { column: "end_date", days: 30 },
  mapRow: mapMembershipRow,
  toFormValues: membershipFormValues,
  rpcCreate: "create_membership",
  rpcUpdate: "update_membership",
  idUpdateParam: "p_membership_id",
  buildCreateParams: (values) => membershipCreateParams(values),
  buildUpdateParams: (values) => membershipUpdateParams(values),
});

export const membershipFreezeAdapter = createTableAdapter<MembershipFreezeRow>({
  table: "membership_freezes",
  select:
    "id, organization_id, membership_id, start_date, end_date, days, reason, memberships(id, gym_members(full_name, first_name, last_name, code), membership_plans(name, code))",
  searchColumns: ["reason"],
  order: { column: "start_date", ascending: false },
  mapRow: (row): MembershipFreezeRow => {
    const membership = (Array.isArray(row.memberships) ? row.memberships[0] : row.memberships) as
      | Row
      | null;
    return {
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      membershipId: asString(row.membership_id),
      memberName: embedName(membership?.gym_members) ?? "Member",
      planName: embedName(membership?.membership_plans) ?? "Plan",
      startDate: asString(row.start_date),
      endDate: asString(row.end_date),
      days: asNumber(row.days),
      reason: asNullableString(row.reason),
    };
  },
  toFormValues: (row): ResourceValues => ({
    membershipId: row.membershipId,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    reason: row.reason ?? "",
  }),
  rpcCreate: "create_membership_freeze",
  buildCreateParams: (values) => ({
    p_membership_id: textOrNull(values.membershipId),
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_reason: textOrNull(values.reason),
  }),
});

export const attendanceAdapter = createTableAdapter<AttendanceRow>({
  table: "attendance_records",
  select:
    "id, organization_id, branch_id, member_id, check_in_at, check_out_at, method, notes, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code)",
  searchColumns: ["notes", "method"],
  order: { column: "check_in_at", ascending: false },
  filterColumns: { method: "method", branchId: "branch_id" },
  dateEqFilters: { day: "check_in_at" },
  isNullFilters: { open: "check_out_at" },
  mapRow: (row): AttendanceRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    checkInAt: asString(row.check_in_at),
    checkOutAt: asNullableString(row.check_out_at),
    method: asString(row.method) || "manual",
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    branchId: row.branchId,
    memberId: row.memberId,
    checkInAt: toDateTimeLocal(row.checkInAt),
    checkOutAt: toDateTimeLocal(row.checkOutAt),
    method: row.method || "manual",
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_attendance_record",
  rpcUpdate: "update_attendance_record",
  idUpdateParam: "p_record_id",
  buildCreateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_member_id: textOrNull(values.memberId),
    p_check_in_at: datetimeOrNull(values.checkInAt),
    p_method: textOrNull(values.method) ?? "manual",
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_check_out_at: datetimeOrNull(values.checkOutAt),
    p_notes: textOrNull(values.notes),
  }),
});

export const trainerAssignmentAdapter = createTableAdapter<TrainerAssignmentRow>({
  table: "trainer_assignments",
  select:
    "id, organization_id, trainer_id, member_id, assigned_at, status, notes, trainers(id, full_name, first_name, last_name), gym_members(id, full_name, first_name, last_name, code)",
  searchColumns: ["notes"],
  order: { column: "assigned_at", ascending: false },
  filterColumns: { status: "status" },
  mapRow: (row): TrainerAssignmentRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    trainerId: asString(row.trainer_id),
    trainerName: embedName(row.trainers) ?? "Trainer",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    assignedAt: asString(row.assigned_at),
    status: asString(row.status) || "active",
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    trainerId: row.trainerId,
    memberId: row.memberId,
    assignedAt: dateOnly(row.assignedAt),
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_trainer_assignment",
  idUpdateParam: "p_assignment_id",
  buildCreateParams: (values) => ({
    p_trainer_id: textOrNull(values.trainerId),
    p_member_id: textOrNull(values.memberId),
    p_assigned_at: textOrNull(values.assignedAt),
    p_notes: textOrNull(values.notes),
  }),
  setActiveRpc: "set_trainer_assignment_status",
  setActiveIdParam: "p_assignment_id",
  setActiveValueParam: "p_active",
});

export const ptSessionAdapter = createTableAdapter<PtSessionRow>({
  table: "pt_sessions",
  select:
    "id, organization_id, branch_id, trainer_id, member_id, scheduled_at, duration_minutes, status, notes, branches(id, name, code), trainers(id, full_name, first_name, last_name), gym_members(id, full_name, first_name, last_name, code)",
  searchColumns: ["notes"],
  order: { column: "scheduled_at", ascending: false },
  filterColumns: { status: "status" },
  mapRow: (row): PtSessionRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    trainerId: asString(row.trainer_id),
    trainerName: embedName(row.trainers) ?? "Trainer",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    scheduledAt: asString(row.scheduled_at),
    durationMinutes: asNumber(row.duration_minutes, 60),
    status: asString(row.status) || "scheduled",
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    branchId: row.branchId,
    trainerId: row.trainerId,
    memberId: row.memberId,
    scheduledAt: toDateTimeLocal(row.scheduledAt),
    durationMinutes: numberString(row.durationMinutes, "60"),
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_pt_session",
  rpcUpdate: "update_pt_session",
  idUpdateParam: "p_session_id",
  buildCreateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_trainer_id: textOrNull(values.trainerId),
    p_member_id: textOrNull(values.memberId),
    p_scheduled_at: datetimeOrNull(values.scheduledAt),
    p_duration_minutes: numberOrNull(values.durationMinutes) ?? 0,
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_trainer_id: textOrNull(values.trainerId),
    p_member_id: textOrNull(values.memberId),
    p_scheduled_at: datetimeOrNull(values.scheduledAt),
    p_duration_minutes: numberOrNull(values.durationMinutes) ?? 0,
    p_notes: textOrNull(values.notes),
  }),
});

function mapClassBookingRow(row: Row): ClassBookingRow {
  const session = (Array.isArray(row.class_sessions) ? row.class_sessions[0] : row.class_sessions) as
    | Row
    | null;
  const template = session
    ? ((Array.isArray(session.class_templates) ? session.class_templates[0] : session.class_templates) as
        | Row
        | null)
    : null;
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(session?.branch_id) || "",
    branchName: embedName(session?.branches) ?? "Unknown branch",
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    classSessionId: asString(row.class_session_id),
    classTemplateId: asNullableString(session?.class_template_id),
    className: embedName(template) ?? "Class",
    trainerId: asNullableString(session?.trainer_id),
    trainerName: embedName(session?.trainers),
    startsAt: asNullableString(session?.starts_at),
    endsAt: asNullableString(session?.ends_at),
    capacity: asNullableNumber(session?.capacity),
    status: asString(row.status) || "booked",
    notes: asNullableString(row.notes),
  };
}

function classBookingFormValues(row: ClassBookingRow): ResourceValues {
  return {
    branchId: row.branchId,
    memberId: row.memberId,
    classSessionId: row.classSessionId,
    classTemplateId: row.classTemplateId ?? "",
    trainerId: row.trainerId ?? "",
    startsAt: toDateTimeLocal(row.startsAt),
    endsAt: toDateTimeLocal(row.endsAt),
    capacity: numberString(row.capacity),
    status: row.status || "booked",
    notes: row.notes ?? "",
  };
}

function classBookingCreateParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_member_id: textOrNull(values.memberId),
    p_class_session_id: textOrNull(values.classSessionId),
    p_class_template_id: textOrNull(values.classTemplateId),
    p_trainer_id: textOrNull(values.trainerId),
    p_starts_at: datetimeOrNull(values.startsAt),
    p_ends_at: datetimeOrNull(values.endsAt),
    p_capacity: numberOrNull(values.capacity),
    p_status: textOrNull(values.status) ?? "booked",
    p_notes: textOrNull(values.notes),
  };
}

function classBookingUpdateParams(values: ResourceValues) {
  return {
    p_status: textOrNull(values.status) ?? "booked",
    p_notes: textOrNull(values.notes),
  };
}

const classBookingSelect =
  "id, organization_id, class_session_id, member_id, status, notes, gym_members(id, full_name, first_name, last_name, code), class_sessions(id, branch_id, class_template_id, trainer_id, starts_at, ends_at, capacity, branches(id, name, code), class_templates(id, name), trainers(id, full_name, first_name, last_name))";

export const classSessionAdapter = createTableAdapter<ClassSessionRow>({
  table: "class_sessions",
  select:
    "id, organization_id, branch_id, class_template_id, trainer_id, starts_at, ends_at, capacity, status, notes, branches(id, name, code), class_templates(id, name), trainers(id, full_name, first_name, last_name)",
  searchColumns: ["notes"],
  order: { column: "starts_at", ascending: false },
  filterColumns: { status: "status", branchId: "branch_id" },
  dateEqFilters: { day: "starts_at" },
  mapRow: (row): ClassSessionRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    classTemplateId: asString(row.class_template_id),
    className: embedName(row.class_templates) ?? "Class",
    trainerId: asNullableString(row.trainer_id),
    trainerName: embedName(row.trainers),
    startsAt: asString(row.starts_at),
    endsAt: asString(row.ends_at),
    capacity: asNumber(row.capacity),
    status: asString(row.status) || "scheduled",
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    branchId: row.branchId,
    classTemplateId: row.classTemplateId,
    trainerId: row.trainerId ?? "",
    startsAt: toDateTimeLocal(row.startsAt),
    endsAt: toDateTimeLocal(row.endsAt),
    capacity: numberString(row.capacity, "0"),
    status: row.status || "scheduled",
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_class_session",
  rpcUpdate: "update_class_session",
  idUpdateParam: "p_session_id",
  buildCreateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_class_template_id: textOrNull(values.classTemplateId),
    p_trainer_id: textOrNull(values.trainerId),
    p_starts_at: datetimeOrNull(values.startsAt),
    p_ends_at: datetimeOrNull(values.endsAt),
    p_capacity: numberOrNull(values.capacity),
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_branch_id: textOrNull(values.branchId),
    p_trainer_id: textOrNull(values.trainerId),
    p_starts_at: datetimeOrNull(values.startsAt),
    p_ends_at: datetimeOrNull(values.endsAt),
    p_capacity: numberOrNull(values.capacity) ?? 0,
    p_status: textOrNull(values.status) ?? "scheduled",
    p_notes: textOrNull(values.notes),
  }),
});

export const classBookingAdapter = createTableAdapter<ClassBookingRow>({
  table: "class_bookings",
  select: classBookingSelect,
  searchColumns: ["notes"],
  order: { column: "created_at", ascending: false },
  filterColumns: { status: "status" },
  mapRow: mapClassBookingRow,
  toFormValues: classBookingFormValues,
  rpcCreate: "create_class_booking",
  rpcUpdate: "update_class_booking",
  idUpdateParam: "p_booking_id",
  buildCreateParams: (values) => classBookingCreateParams(values),
  buildUpdateParams: (values) => classBookingUpdateParams(values),
});

export const waitlistBookingAdapter = createTableAdapter<ClassBookingRow>({
  table: "class_bookings",
  select: classBookingSelect,
  searchColumns: ["notes"],
  order: { column: "created_at", ascending: false },
  filterColumns: { status: "status" },
  fixedEq: { status: "waitlisted" },
  mapRow: mapClassBookingRow,
  toFormValues: classBookingFormValues,
  rpcCreate: "create_class_booking",
  rpcUpdate: "update_class_booking",
  idUpdateParam: "p_booking_id",
  buildCreateParams: (values) => ({
    ...classBookingCreateParams(values),
    p_status: textOrNull(values.status) ?? "waitlisted",
  }),
  buildUpdateParams: (values) => classBookingUpdateParams(values),
});

export const workoutPlanAdapter = createTableAdapter<WorkoutPlanRow>({
  table: "workout_plans",
  select:
    "id, organization_id, member_id, trainer_id, name, goal, start_date, end_date, notes, is_active, gym_members(id, full_name, first_name, last_name, code), trainers(id, full_name, first_name, last_name)",
  searchColumns: ["name", "goal", "notes"],
  order: { column: "start_date", ascending: false },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): WorkoutPlanRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    trainerId: asNullableString(row.trainer_id),
    trainerName: embedName(row.trainers),
    name: asString(row.name),
    goal: asNullableString(row.goal),
    startDate: asNullableString(row.start_date),
    endDate: asNullableString(row.end_date),
    notes: asNullableString(row.notes),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    memberId: row.memberId,
    trainerId: row.trainerId ?? "",
    name: row.name,
    goal: row.goal ?? "",
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    notes: row.notes ?? "",
    isActive: row.isActive,
  }),
  rpcCreate: "create_workout_plan",
  rpcUpdate: "update_workout_plan",
  idUpdateParam: "p_plan_id",
  buildCreateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_trainer_id: textOrNull(values.trainerId),
    p_name: textOrNull(values.name) ?? "",
    p_goal: textOrNull(values.goal),
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_notes: textOrNull(values.notes),
    p_is_active: booleanValue(values.isActive),
  }),
  buildUpdateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_trainer_id: textOrNull(values.trainerId),
    p_name: textOrNull(values.name) ?? "",
    p_goal: textOrNull(values.goal),
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_notes: textOrNull(values.notes),
    p_is_active: booleanValue(values.isActive),
  }),
  setActiveRpc: "set_workout_plan_status",
  setActiveIdParam: "p_plan_id",
  setActiveValueParam: "p_active",
});

export const dietPlanAdapter = createTableAdapter<DietPlanRow>({
  table: "diet_plans",
  select:
    "id, organization_id, member_id, trainer_id, name, start_date, end_date, notes, is_active, gym_members(id, full_name, first_name, last_name, code), trainers(id, full_name, first_name, last_name)",
  searchColumns: ["name", "notes"],
  order: { column: "start_date", ascending: false },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): DietPlanRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    trainerId: asNullableString(row.trainer_id),
    trainerName: embedName(row.trainers),
    name: asString(row.name),
    startDate: asNullableString(row.start_date),
    endDate: asNullableString(row.end_date),
    notes: asNullableString(row.notes),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    memberId: row.memberId,
    trainerId: row.trainerId ?? "",
    name: row.name,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    notes: row.notes ?? "",
    isActive: row.isActive,
  }),
  rpcCreate: "create_diet_plan",
  rpcUpdate: "update_diet_plan",
  idUpdateParam: "p_plan_id",
  buildCreateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_trainer_id: textOrNull(values.trainerId),
    p_name: textOrNull(values.name) ?? "",
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_notes: textOrNull(values.notes),
    p_is_active: booleanValue(values.isActive),
  }),
  buildUpdateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_trainer_id: textOrNull(values.trainerId),
    p_name: textOrNull(values.name) ?? "",
    p_start_date: textOrNull(values.startDate),
    p_end_date: textOrNull(values.endDate),
    p_notes: textOrNull(values.notes),
    p_is_active: booleanValue(values.isActive),
  }),
  setActiveRpc: "set_diet_plan_status",
  setActiveIdParam: "p_plan_id",
  setActiveValueParam: "p_active",
});

function measurementParams(values: ResourceValues) {
  return {
    p_member_id: textOrNull(values.memberId),
    p_measured_at: textOrNull(values.measuredAt),
    p_weight_kg: numberOrNull(values.weightKg),
    p_height_cm: numberOrNull(values.heightCm),
    p_body_fat_percent: numberOrNull(values.bodyFatPercent),
    p_chest_cm: numberOrNull(values.chestCm),
    p_waist_cm: numberOrNull(values.waistCm),
    p_hips_cm: numberOrNull(values.hipsCm),
    p_arms_cm: numberOrNull(values.armsCm),
    p_thighs_cm: numberOrNull(values.thighsCm),
    p_notes: textOrNull(values.notes),
  };
}

export const bodyMeasurementAdapter = createTableAdapter<BodyMeasurementRow>({
  table: "body_measurements",
  select:
    "id, organization_id, member_id, measured_at, weight_kg, height_cm, body_fat_percent, chest_cm, waist_cm, hips_cm, arms_cm, thighs_cm, notes, gym_members(id, full_name, first_name, last_name, code)",
  searchColumns: ["notes"],
  order: { column: "measured_at", ascending: false },
  mapRow: (row): BodyMeasurementRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    measuredAt: asString(row.measured_at),
    weightKg: asNullableNumber(row.weight_kg),
    heightCm: asNullableNumber(row.height_cm),
    bodyFatPercent: asNullableNumber(row.body_fat_percent),
    chestCm: asNullableNumber(row.chest_cm),
    waistCm: asNullableNumber(row.waist_cm),
    hipsCm: asNullableNumber(row.hips_cm),
    armsCm: asNullableNumber(row.arms_cm),
    thighsCm: asNullableNumber(row.thighs_cm),
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    memberId: row.memberId,
    measuredAt: dateOnly(row.measuredAt),
    weightKg: numberString(row.weightKg),
    heightCm: numberString(row.heightCm),
    bodyFatPercent: numberString(row.bodyFatPercent),
    chestCm: numberString(row.chestCm),
    waistCm: numberString(row.waistCm),
    hipsCm: numberString(row.hipsCm),
    armsCm: numberString(row.armsCm),
    thighsCm: numberString(row.thighsCm),
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_body_measurement",
  rpcUpdate: "update_body_measurement",
  idUpdateParam: "p_measurement_id",
  buildCreateParams: (values) => measurementParams(values),
  buildUpdateParams: (values) => measurementParams(values),
});

export const progressEntryAdapter = createTableAdapter<ProgressEntryRow>({
  table: "progress_entries",
  select:
    "id, organization_id, member_id, entry_date, weight_kg, photo_url, notes, gym_members(id, full_name, first_name, last_name, code)",
  searchColumns: ["notes"],
  order: { column: "entry_date", ascending: false },
  mapRow: (row): ProgressEntryRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    memberId: asString(row.member_id),
    memberName: embedName(row.gym_members) ?? "Member",
    entryDate: asString(row.entry_date),
    weightKg: asNullableNumber(row.weight_kg),
    photoUrl: asNullableString(row.photo_url),
    notes: asNullableString(row.notes),
  }),
  toFormValues: (row): ResourceValues => ({
    memberId: row.memberId,
    entryDate: dateOnly(row.entryDate),
    weightKg: numberString(row.weightKg),
    photoUrl: row.photoUrl ?? "",
    notes: row.notes ?? "",
  }),
  rpcCreate: "create_progress_entry",
  rpcUpdate: "update_progress_entry",
  idUpdateParam: "p_entry_id",
  buildCreateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_entry_date: textOrNull(values.entryDate),
    p_weight_kg: numberOrNull(values.weightKg),
    p_photo_url: textOrNull(values.photoUrl),
    p_notes: textOrNull(values.notes),
  }),
  buildUpdateParams: (values) => ({
    p_member_id: textOrNull(values.memberId),
    p_entry_date: textOrNull(values.entryDate),
    p_weight_kg: numberOrNull(values.weightKg),
    p_photo_url: textOrNull(values.photoUrl),
    p_notes: textOrNull(values.notes),
  }),
});
