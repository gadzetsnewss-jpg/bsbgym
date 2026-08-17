/**
 * Client-side organization services (Phase 3).
 *
 * All organization operations (members, invitations, roles, branch access)
 * go through this module so pages never talk to Supabase directly. Mutations
 * use the SECURITY DEFINER RPCs from the migration - the server derives the
 * caller's organization from the auth context, never from the frontend.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { UserStatus, InvitationStatus } from "@/lib/supabase/types";

export type OrgResult<T = undefined> =
  | { data: T; error: null }
  | { data: null; error: { message: string } };

const errorOf = (error: unknown): { message: string } => ({
  message:
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "Something went wrong. Please try again.",
});

function clientOrNull() {
  return getSupabaseBrowserClient();
}

/* ---------------------------------------------------------------------------
   Reference data
   --------------------------------------------------------------------------- */

export interface BusinessTypeOption {
  code: string;
  label: string;
}

export async function fetchBusinessTypes(): Promise<OrgResult<BusinessTypeOption[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("business_types")
    .select("code, label")
    .order("sort_order");
  if (error) return { data: null, error: errorOf(error) };
  return { data, error: null };
}

/* ---------------------------------------------------------------------------
   Roles
   --------------------------------------------------------------------------- */

export interface RoleOption {
  id: string;
  name: string;
  slug: string;
  description: string | null;
}

export async function fetchOrgRoles(organizationId: string): Promise<OrgResult<RoleOption[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("roles")
    .select("id, name, slug, description")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) return { data: null, error: errorOf(error) };
  return { data, error: null };
}

export interface OrgBranchOption {
  id: string;
  name: string;
  code: string;
  city: string | null;
}

export async function fetchOrgBranches(organizationId: string): Promise<OrgResult<OrgBranchOption[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code, city")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) return { data: null, error: errorOf(error) };
  return { data, error: null };
}

/* ---------------------------------------------------------------------------
   Members (user management)
   --------------------------------------------------------------------------- */

export interface OrgMemberRow {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  status: UserStatus;
  accessAllBranches: boolean;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  branchNames: string[];
  acceptedAt: string | null;
}

export async function fetchOrgMembers(organizationId: string): Promise<OrgResult<OrgMemberRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const [membersRes, branchesRes] = await Promise.all([
    supabase
      .from("organization_members")
      .select(
        "id, user_id, role_id, status, access_all_branches, accepted_at, roles(id, name, slug), profiles(id, first_name, last_name, email, phone, avatar_url)",
      )
      .eq("organization_id", organizationId)
      .order("created_at"),
    supabase
      .from("member_branches")
      .select("member_id, branches(id, name, city)")
      .eq("organization_id", organizationId),
  ]);

  if (membersRes.error) return { data: null, error: errorOf(membersRes.error) };
  if (branchesRes.error) return { data: null, error: errorOf(branchesRes.error) };

  const branchByMember = new Map<string, string[]>();
  for (const row of branchesRes.data) {
    const names = branchByMember.get(row.member_id) ?? [];
    names.push(row.branches?.name ?? "Unknown branch");
    branchByMember.set(row.member_id, names);
  }

  const members: OrgMemberRow[] = membersRes.data.map((row) => {
    const role = row.roles as unknown as { id: string; name: string; slug: string } | null;
    const profile = row.profiles as unknown as {
      id: string;
      first_name: string;
      last_name: string;
      email: string | null;
      phone: string | null;
      avatar_url: string | null;
    } | null;

    return {
      id: row.id,
      userId: row.user_id,
      roleId: row.role_id,
      roleName: role?.name ?? "Unknown",
      roleSlug: role?.slug ?? "",
      status: row.status,
      accessAllBranches: row.access_all_branches,
      firstName: profile?.first_name ?? "",
      lastName: profile?.last_name ?? "",
      email: profile?.email ?? null,
      phone: profile?.phone ?? null,
      avatarUrl: profile?.avatar_url ?? null,
      branchNames: branchByMember.get(row.id) ?? [],
      acceptedAt: row.accepted_at,
    };
  });

  return { data: members, error: null };
}

export async function updateMemberRole(memberId: string, roleId: string): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_member_role", {
    p_member_id: memberId,
    p_role_id: roleId,
  });
  if (error) return { data: null, error: errorOf(error) };
  return { data: undefined, error: null };
}

export async function setMemberStatus(
  memberId: string,
  status: UserStatus,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("set_member_status", {
    p_member_id: memberId,
    p_status: status,
  });
  if (error) return { data: null, error: errorOf(error) };
  return { data: undefined, error: null };
}

export async function updateMemberBranchAccess(
  memberId: string,
  branchIds: string[],
  allBranches: boolean,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_member_branch_access", {
    p_member_id: memberId,
    p_branch_ids: branchIds,
    p_all_branches: allBranches,
  });
  if (error) return { data: null, error: errorOf(error) };
  return { data: undefined, error: null };
}

/* ---------------------------------------------------------------------------
   Invitations
   --------------------------------------------------------------------------- */

export interface InvitationRow {
  id: string;
  email: string;
  roleName: string;
  roleSlug: string;
  status: InvitationStatus;
  accessAllBranches: boolean;
  branchNames: string[];
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

export async function fetchInvitations(organizationId: string): Promise<OrgResult<InvitationRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const [invitesRes, branchesRes] = await Promise.all([
    supabase
      .from("invitations")
      .select("id, email, role_id, status, access_all_branches, expires_at, accepted_at, created_at")
      .eq("organization_id", organizationId)
      .order("created_at", { ascending: false }),
    supabase
      .from("invitation_branches")
      .select("invitation_id, branches(id, name)")
      .eq("organization_id", organizationId),
  ]);

  if (invitesRes.error) return { data: null, error: errorOf(invitesRes.error) };
  if (branchesRes.error) return { data: null, error: errorOf(branchesRes.error) };

  const rolesRes = await supabase
    .from("roles")
    .select("id, name, slug")
    .eq("organization_id", organizationId);
  if (rolesRes.error) return { data: null, error: errorOf(rolesRes.error) };

  const roleById = new Map(rolesRes.data.map((role) => [role.id, role]));

  const branchByInvite = new Map<string, string[]>();
  for (const row of branchesRes.data) {
    const names = branchByInvite.get(row.invitation_id) ?? [];
    names.push(row.branches?.name ?? "Unknown branch");
    branchByInvite.set(row.invitation_id, names);
  }

  const invitations: InvitationRow[] = invitesRes.data.map((row) => {
    const role = roleById.get(row.role_id);
    return {
      id: row.id,
      email: row.email,
      roleName: role?.name ?? "Unknown",
      roleSlug: role?.slug ?? "",
      status: row.status,
      accessAllBranches: row.access_all_branches,
      branchNames: branchByInvite.get(row.id) ?? [],
      expiresAt: row.expires_at,
      acceptedAt: row.accepted_at,
      createdAt: row.created_at,
    };
  });

  return { data: invitations, error: null };
}

export interface CreateInvitationInput {
  organizationId: string;
  email: string;
  roleId: string;
  branchIds: string[];
  accessAllBranches: boolean;
  expiresInHours?: number;
}

export interface CreateInvitationResult {
  invitationId: string;
  /** Raw token returned exactly once - build the accept link with it. */
  token: string;
}

export async function createInvitation(
  input: CreateInvitationInput,
): Promise<OrgResult<CreateInvitationResult>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("create_invitation", {
    p_org_id: input.organizationId,
    p_email: input.email,
    p_role_id: input.roleId,
    p_branch_ids: input.accessAllBranches ? null : input.branchIds,
    p_all_branches: input.accessAllBranches,
    p_expires_hours: input.expiresInHours ?? 168,
  });

  if (error) return { data: null, error: errorOf(error) };
  const rows = data as unknown as CreateInvitationResult[] | null;
  const first = rows?.[0];
  if (!first?.token) return { data: null, error: { message: "No invitation was created." } };
  return { data: first, error: null };
}

export async function revokeInvitation(invitationId: string): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("revoke_invitation", {
    p_invitation_id: invitationId,
  });
  if (error) return { data: null, error: errorOf(error) };
  return { data: undefined, error: null };
}

export interface AcceptInvitationResult {
  organization_id: string;
  member_id: string;
  role: string;
  name: string;
}

export async function acceptInvitation(token: string): Promise<OrgResult<AcceptInvitationResult>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("accept_invitation", { p_token: token });
  if (error) return { data: null, error: errorOf(error) };
  return { data: data as unknown as AcceptInvitationResult, error: null };
}
