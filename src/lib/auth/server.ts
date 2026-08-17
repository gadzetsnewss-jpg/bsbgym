/**
 * Server-side auth & app context (Phase 3).
 *
 * The (app) layout calls `resolveAppContext()` once per request: it validates
 * the session, loads the profile, the active organization membership, the
 * member's role + permissions, and the authorized branches. The result is
 * passed into the client providers so no per-page refetching is needed.
 *
 * RLS is the security layer underneath every query here - the member's data
 * can only be read if the caller actually belongs to the organization.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { createServerSupabase, isSupabaseConfigured } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/types";
import type { AppContextData } from "@/lib/auth/types";
import { toAppProfile } from "@/lib/auth/session";

type Db = SupabaseClient<Database>;

export interface ResolvedAppContext {
  status: "not_configured" | "unauthenticated" | "no_organization" | "ok";
  context?: AppContextData;
}

export interface ServerSessionUser {
  id: string;
  email: string | null;
}

/** Returns the signed-in user or null (works only when configured). */
export async function getServerSessionUser(): Promise<ServerSessionUser | null> {
  if (!isSupabaseConfigured) return null;
  const supabase = await createServerSupabase();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  return { id: user.id, email: user.email ?? null };
}

async function fetchMemberBranchIds(
  supabase: Db,
  memberId: string,
): Promise<string[] | null> {
  const { data, error } = await supabase
    .from("member_branches")
    .select("branch_id")
    .eq("member_id", memberId);

  if (error) return null;
  return data.map((row) => row.branch_id);
}

/**
 * Resolves the full app context for the current request, or a reason the
 * request cannot be served. Never throws for auth reasons.
 */
export async function resolveAppContext(): Promise<ResolvedAppContext> {
  if (!isSupabaseConfigured) return { status: "not_configured" };

  const supabase = await createServerSupabase();
  if (!supabase) return { status: "not_configured" };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthenticated" };

  const [profileResult, memberResult] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase
      .from("organization_members")
      .select("id, organization_id, user_id, role_id, status, access_all_branches, roles(id, name, slug)")
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
  ]);

  if (profileResult.error) return { status: "unauthenticated" };
  if (memberResult.error || !memberResult.data) return { status: "no_organization" };

  const member = memberResult.data;
  const role = member.roles as unknown as { id: string; name: string; slug: string } | null;
  if (!role) return { status: "no_organization" };

  const [orgResult, permissionsResult, branchResult] = await Promise.all([
    supabase.from("organizations").select("*").eq("id", member.organization_id).single(),
    supabase.from("role_permissions").select("permission").eq("role_id", member.role_id),
    member.access_all_branches
      ? supabase
          .from("branches")
          .select("*")
          .eq("organization_id", member.organization_id)
          .eq("status", "active")
          .order("name")
      : undefined,
  ]);

  if (orgResult.error || !orgResult.data) return { status: "no_organization" };
  if (permissionsResult.error) return { status: "no_organization" };

  let branches: AppContextData["branches"] = [];
  if (member.access_all_branches) {
    if (branchResult?.error) return { status: "no_organization" };
    branches = (branchResult?.data ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      code: row.code,
      city: row.city,
      timezone: row.timezone,
      status: row.status,
    }));
  } else {
    const branchIds = await fetchMemberBranchIds(supabase, member.id);
    if (!branchIds) return { status: "no_organization" };
    if (branchIds.length > 0) {
      const { data, error } = await supabase
        .from("branches")
        .select("*")
        .in("id", branchIds)
        .eq("status", "active")
        .order("name");
      if (error) return { status: "no_organization" };
      branches = data.map((row) => ({
        id: row.id,
        name: row.name,
        code: row.code,
        city: row.city,
        timezone: row.timezone,
        status: row.status,
      }));
    }
  }

  const org = orgResult.data;
  const profile = profileResult.data ?? {
    id: user.id,
    first_name: "",
    last_name: "",
    email: user.email ?? null,
    phone: null,
    avatar_url: null,
    preferences: {},
  };

  const context: AppContextData = {
    profile: toAppProfile(profile),
    organization: {
      id: org.id,
      name: org.name,
      legalName: org.legal_name,
      businessType: org.business_type,
      email: org.email,
      phone: org.phone,
      website: org.website,
      addressLine1: org.address_line1,
      addressLine2: org.address_line2,
      city: org.city,
      state: org.state,
      postalCode: org.postal_code,
      country: org.country,
      taxId: org.tax_id,
      currency: org.currency,
      timezone: org.timezone,
      dateFormat: org.date_format,
      logoUrl: org.logo_url,
      status: org.status,
    },
    member: {
      id: member.id,
      userId: member.user_id,
      roleId: member.role_id,
      roleName: role.name,
      roleSlug: role.slug,
      status: member.status,
      accessAllBranches: member.access_all_branches,
    },
    permissions: (permissionsResult.data ?? []).map((row) => row.permission),
    branches,
    currentBranchId: null,
  };

  return { status: "ok", context };
}

/** True when the current environment has real Supabase credentials. */
export { isSupabaseConfigured };
