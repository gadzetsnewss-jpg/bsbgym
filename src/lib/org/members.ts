/**
 * Client-side organization services (Phase 3).
 *
 * All organization operations (members, invitations, roles, branch access)
 * go through this module so pages never talk to Supabase directly. Mutations
 * use the SECURITY DEFINER RPCs from the migration - the server derives the
 * caller's organization from the auth context, never from the frontend.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
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
  isSystem: boolean;
  isActive: boolean;
}

export async function fetchOrgRoles(organizationId: string): Promise<OrgResult<RoleOption[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("roles")
    .select("id, name, slug, description, is_system, is_active")
    .eq("organization_id", organizationId)
    .order("name");
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  const rows: RoleOption[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isSystem: row.is_system,
    isActive: row.is_active,
  }));
  return { data: rows, error: null };
}

/** Role plus its full permission set - used by the role manager. */
export interface RoleWithPermissions extends RoleOption {
  permissions: string[];
  memberCount: number;
}

export async function fetchRolesWithPermissions(
  organizationId: string,
): Promise<OrgResult<RoleWithPermissions[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const [rolesRes, permsRes, membersRes] = await Promise.all([
    supabase
      .from("roles")
      .select("id, name, slug, description, is_system, is_active")
      .eq("organization_id", organizationId)
      .order("name"),
    supabase
      .from("role_permissions")
      .select("role_id, permission")
      .eq("organization_id", organizationId),
    supabase
      .from("organization_members")
      .select("role_id, status")
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  if (rolesRes.error) return { data: null, error: { message: friendlyMessage(rolesRes.error) } };
  if (permsRes.error) return { data: null, error: { message: friendlyMessage(permsRes.error) } };
  if (membersRes.error) return { data: null, error: { message: friendlyMessage(membersRes.error) } };

  const permsByRole = new Map<string, string[]>();
  for (const row of permsRes.data ?? []) {
    const list = permsByRole.get(row.role_id) ?? [];
    list.push(row.permission);
    permsByRole.set(row.role_id, list);
  }
  const memberCountByRole = new Map<string, number>();
  for (const row of membersRes.data ?? []) {
    memberCountByRole.set(row.role_id, (memberCountByRole.get(row.role_id) ?? 0) + 1);
  }

  const roles: RoleWithPermissions[] = (rolesRes.data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    isSystem: row.is_system,
    isActive: row.is_active,
    permissions: permsByRole.get(row.id) ?? [],
    memberCount: memberCountByRole.get(row.id) ?? 0,
  }));

  return { data: roles, error: null };
}

export interface CreateRoleInput {
  organizationId: string;
  name: string;
  slug: string;
  description?: string | null;
  permissions?: string[];
}

export async function createRole(input: CreateRoleInput): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("create_role", {
    p_org_id: input.organizationId,
    p_name: input.name,
    p_slug: input.slug,
    p_description: input.description ?? null,
    p_permissions: input.permissions ?? [],
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: data as unknown as string }, error: null };
}

export async function updateRole(
  roleId: string,
  name: string,
  description?: string | null,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_role", {
    p_role_id: roleId,
    p_name: name,
    p_description: description ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function setRolePermissions(
  roleId: string,
  permissions: string[],
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("set_role_permissions", {
    p_role_id: roleId,
    p_permissions: permissions,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function setRoleStatus(roleId: string, active: boolean): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("set_role_status", {
    p_role_id: roleId,
    p_active: active,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
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

/* ---------------------------------------------------------------------------
   Audit log
   --------------------------------------------------------------------------- */

export interface AuditLogRow {
  id: string;
  action: string;
  targetType: string;
  targetId: string | null;
  actorName: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
}

const ACTOR_NAME_FIELDS = "id, first_name, last_name, email";

export async function fetchAuditLogs(
  organizationId: string,
  limit = 100,
): Promise<OrgResult<AuditLogRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("audit_logs")
    .select(`id, action, target_type, target_id, metadata, created_at, profiles(${ACTOR_NAME_FIELDS})`)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const rows: AuditLogRow[] = (data ?? []).map((row) => {
    const profile = row.profiles as unknown as {
      first_name: string | null;
      last_name: string | null;
      email: string | null;
    } | null;
    const firstName = profile?.first_name ?? "";
    const lastName = profile?.last_name ?? "";
    const actorName = [firstName, lastName].filter(Boolean).join(" ") || profile?.email || null;

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
