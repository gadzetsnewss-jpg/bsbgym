/**
 * Membership operations client (Phase 3.2c).
 *
 * Reads use RLS-scoped selects. Writes go through SECURITY DEFINER RPCs
 * (`extend_membership`, `renew_membership`). organization_id is never trusted
 * from the client for writes. Freeze remains a membership timeline event.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult, AuditLogRow } from "@/lib/org/members";
import type { MembershipRow } from "@/lib/operations/adapters";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

type Row = Record<string, unknown>;
type AnyTable = "gym_members";

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

const MEMBERSHIP_SELECT =
  "id, organization_id, branch_id, member_id, plan_id, status, start_date, end_date, price, discount, final_amount, freeze_days_used, notes, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code), membership_plans(id, name, code)";

function mapMembershipRow(row: Row): MembershipRow {
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
    notes: asNullableString(row.notes),
  };
}

export async function fetchMembershipsForMember(
  organizationId: string,
  memberId: string,
): Promise<OrgResult<MembershipRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("memberships" as AnyTable)
    .select(MEMBERSHIP_SELECT)
    .eq("organization_id", organizationId)
    .eq("member_id" as "id", memberId)
    .order("end_date" as "created_at", { ascending: false });

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: ((data ?? []) as unknown as Row[]).map(mapMembershipRow), error: null };
}

const ACTOR_NAME_FIELDS = "id, first_name, last_name, email";

export async function fetchMembershipHistory(
  organizationId: string,
  membershipId: string,
): Promise<OrgResult<AuditLogRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`id, action, target_type, target_id, metadata, created_at, profiles(${ACTOR_NAME_FIELDS})`)
    .eq("organization_id", organizationId)
    .eq("target_type", "membership")
    .eq("target_id", membershipId)
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const rows: AuditLogRow[] = (data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
    const actorName =
      [profile?.first_name, profile?.last_name].filter(Boolean).join(" ") || profile?.email || null;
    return {
      id: row.id,
      action: row.action,
      targetType: row.target_type,
      targetId: row.target_id,
      actorName,
      metadata:
        typeof row.metadata === "object" && row.metadata !== null
          ? (row.metadata as Record<string, unknown>)
          : {},
      createdAt: row.created_at,
    };
  });

  return { data: rows, error: null };
}

export async function extendMembership(
  membershipId: string,
  days: number,
  notes?: string | null,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("extend_membership", {
    p_membership_id: membershipId,
    p_days: days,
    p_notes: notes ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function renewMembership(input: {
  membershipId: string;
  planId?: string | null;
  startDate?: string | null;
  price?: number | null;
  discount?: number | null;
  notes?: string | null;
}): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("renew_membership", {
    p_membership_id: input.membershipId,
    p_plan_id: input.planId ?? null,
    p_start_date: input.startDate ?? null,
    p_price: input.price ?? null,
    p_discount: input.discount ?? null,
    p_notes: input.notes ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}
