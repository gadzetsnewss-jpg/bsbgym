/**
 * CRM client helpers that sit outside the generic table adapter:
 * lead conversion and pipeline counts. Writes still go through SECURITY
 * DEFINER RPCs; organization_id is never trusted from the client for writes.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";

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
      trialsActive,
      referralsPending,
    },
    error: null,
  };
}
