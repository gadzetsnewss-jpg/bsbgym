/**
 * CRM client helpers that sit outside the generic table adapter:
 * lead conversion and pipeline counts. Writes still go through SECURITY
 * DEFINER RPCs; organization_id is never trusted from the client for writes.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import { followUpAdapter, trialAdapter, type FollowUpRow, type TrialRow } from "@/lib/crm/adapters";

type AnyTable = "gym_members";
type AnyFunction = "create_gym_member";
type AnyColumn = "id";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

export interface CrmPipelineCounts {
  newLeads: number;
  contacted: number;
  qualified: number;
  trial: number;
  converted: number;
  lost: number;
  followUpsToday: number;
  followUpsOverdue: number;
  trialsUpcoming: number;
  trialsActive: number;
  referralsPending: number;
}

export async function convertLeadToMember(input: {
  leadId: string;
  branchId: string;
  lastName: string;
  phone: string;
}): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await (supabase.rpc as unknown as (
    fn: AnyFunction,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(
    "convert_lead_to_member" as AnyFunction,
    {
      p_lead_id: input.leadId,
      p_branch_id: input.branchId,
      p_last_name: input.lastName,
      p_phone: input.phone,
    },
  );
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

async function countEq(
  organizationId: string,
  table: string,
  column: string,
  value: string,
): Promise<number> {
  const supabase = clientOrNull();
  if (!supabase) return 0;
  const { count } = await supabase
    .from(table as AnyTable)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq(column as AnyColumn, value);
  return count ?? 0;
}

export async function fetchCrmPipelineCounts(
  organizationId: string,
): Promise<OrgResult<CrmPipelineCounts>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const start = new Date();
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  const [
    newLeads,
    contacted,
    qualified,
    trial,
    converted,
    lost,
    followUpsToday,
    followUpsOverdue,
    trialsUpcoming,
    trialsActive,
    referralsPending,
  ] = await Promise.all([
    countEq(organizationId, "leads", "status", "new"),
    countEq(organizationId, "leads", "status", "contacted"),
    countEq(organizationId, "leads", "status", "qualified"),
    countEq(organizationId, "leads", "status", "trial"),
    countEq(organizationId, "leads", "status", "converted"),
    countEq(organizationId, "leads", "status", "lost"),
    supabase
      .from("follow_ups" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status" as AnyColumn, "pending")
      .gte("due_at" as AnyColumn, start.toISOString())
      .lt("due_at" as AnyColumn, end.toISOString())
      .then((result) => result.count ?? 0),
    supabase
      .from("follow_ups" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status" as AnyColumn, "pending")
      .lt("due_at" as AnyColumn, start.toISOString())
      .then((result) => result.count ?? 0),
    supabase
      .from("trial_memberships" as AnyTable)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .in("status" as AnyColumn, ["scheduled", "active"])
      .gte("starts_on" as AnyColumn, start.toISOString().slice(0, 10))
      .then((result) => result.count ?? 0),
    countEq(organizationId, "trial_memberships", "status", "active"),
    countEq(organizationId, "referrals", "status", "pending"),
  ]);

  return {
    data: {
      newLeads,
      contacted,
      qualified,
      trial,
      converted,
      lost,
      followUpsToday,
      followUpsOverdue,
      trialsUpcoming,
      trialsActive,
      referralsPending,
    },
    error: null,
  };
}

export async function fetchLeadFollowUps(
  organizationId: string,
  leadId: string,
): Promise<OrgResult<FollowUpRow[]>> {
  const result = await followUpAdapter.list({
    organizationId,
    search: "",
    page: 1,
    pageSize: 50,
    filters: { leadId, bucket: "all", status: "all" },
  });
  if (result.error) return { data: null, error: result.error };
  return {
    data: result.data.rows.filter((row) => row.leadId === leadId),
    error: null,
  };
}

export async function fetchLeadTrials(
  organizationId: string,
  leadId: string,
): Promise<OrgResult<TrialRow[]>> {
  const result = await trialAdapter.list({
    organizationId,
    search: "",
    page: 1,
    pageSize: 50,
    filters: { leadId, status: "all" },
  });
  if (result.error) return { data: null, error: result.error };
  return {
    data: result.data.rows.filter((row) => row.leadId === leadId),
    error: null,
  };
}

export async function findMatchingLeads(input: {
  organizationId: string;
  phone?: string | null;
  email?: string | null;
  excludeId?: string | null;
}): Promise<OrgResult<{ id: string; fullName: string; phone: string | null; email: string | null }[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const phone = (input.phone ?? "").replace(/[^\d+]/g, "").trim();
  const email = (input.email ?? "").trim().toLowerCase();
  if (!phone && !email) return { data: [], error: null };

  let query = supabase
    .from("leads" as AnyTable)
    .select("id, full_name, first_name, last_name, phone, email")
    .eq("organization_id", input.organizationId)
    .limit(5);

  if (phone && email) {
    query = query.or(`phone.eq.${phone},email.eq.${email}`);
  } else if (phone) {
    query = query.eq("phone" as AnyColumn, phone);
  } else {
    query = query.eq("email" as AnyColumn, email);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  const rows = ((data ?? []) as unknown as Record<string, unknown>[])
    .filter((row) => String(row.id) !== input.excludeId)
    .map((row) => ({
      id: String(row.id),
      fullName:
        (typeof row.full_name === "string" && row.full_name) ||
        [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
        "Lead",
      phone: typeof row.phone === "string" ? row.phone : null,
      email: typeof row.email === "string" ? row.email : null,
    }));
  return { data: rows, error: null };
}
