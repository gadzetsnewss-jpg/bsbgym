/**
 * Gym members (customers) client service (Phase 3.1).
 *
 * Distinct from organization staff (`src/lib/org/members.ts`). Mutations go
 * through SECURITY DEFINER RPCs (`create_gym_member`, `update_gym_member`,
 * `set_gym_member_status`). organization_id is never the only gate: the RPCs
 * re-check membership, permission and branch access from auth.uid(). RLS
 * remains the boundary.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { GymMemberGender, GymMemberStatus } from "@/lib/supabase/types";
import type { OrgResult } from "@/lib/org/members";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

export interface GymMemberRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  branchCode: string;
  code: string;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string;
  gender: GymMemberGender | null;
  dateOfBirth: string | null;
  photoUrl: string | null;
  emergencyContactName: string | null;
  emergencyContactPhone: string | null;
  notes: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  assignedTrainerId: string | null;
  assignedTrainerName: string | null;
  status: GymMemberStatus;
  joinedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface GymMemberListResult {
  rows: GymMemberRow[];
  total: number;
}

export interface GymMemberListFilters {
  organizationId: string;
  search?: string;
  status?: GymMemberStatus | "all";
  branchId?: string | "all";
  page?: number;
  pageSize?: number;
}

type GymMemberQueryRow = {
  id: string;
  organization_id: string;
  branch_id: string;
  code: string;
  first_name: string;
  last_name: string;
  full_name: string | null;
  email: string | null;
  phone: string;
  gender: GymMemberGender | null;
  date_of_birth: string | null;
  photo_url: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  notes: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  assigned_trainer_id: string | null;
  status: GymMemberStatus;
  joined_at: string;
  created_at: string;
  updated_at: string;
  branches: { id: string; name: string; code: string } | { id: string; name: string; code: string }[] | null;
  trainers:
    | { id: string; full_name: string | null; first_name: string; last_name: string }
    | { id: string; full_name: string | null; first_name: string; last_name: string }[]
    | null;
};

function mapRow(row: GymMemberQueryRow): GymMemberRow {
  const branch = Array.isArray(row.branches) ? row.branches[0] : row.branches;
  const trainer = Array.isArray(row.trainers) ? row.trainers[0] : row.trainers;
  const fullName =
    row.full_name?.trim() ||
    [row.first_name, row.last_name].filter(Boolean).join(" ").trim() ||
    row.code;
  const trainerName =
    trainer?.full_name?.trim() ||
    [trainer?.first_name, trainer?.last_name].filter(Boolean).join(" ").trim() ||
    null;
  return {
    id: row.id,
    organizationId: row.organization_id,
    branchId: row.branch_id,
    branchName: branch?.name ?? "Unknown branch",
    branchCode: branch?.code ?? "",
    code: row.code,
    firstName: row.first_name,
    lastName: row.last_name,
    fullName,
    email: row.email,
    phone: row.phone,
    gender: row.gender,
    dateOfBirth: row.date_of_birth,
    photoUrl: row.photo_url,
    emergencyContactName: row.emergency_contact_name,
    emergencyContactPhone: row.emergency_contact_phone,
    notes: row.notes,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    assignedTrainerId: row.assigned_trainer_id,
    assignedTrainerName: trainerName,
    status: row.status,
    joinedAt: row.joined_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const SELECT_COLUMNS =
  "id, organization_id, branch_id, code, first_name, last_name, full_name, email, phone, gender, date_of_birth, photo_url, emergency_contact_name, emergency_contact_phone, notes, address_line1, address_line2, city, state, postal_code, country, assigned_trainer_id, status, joined_at, created_at, updated_at, branches!gym_members_branch_id_fkey(id, name, code), trainers!gym_members_assigned_trainer_fkey(id, full_name, first_name, last_name)";

export async function fetchGymMembers(
  filters: GymMemberListFilters,
): Promise<OrgResult<GymMemberListResult>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("gym_members")
    .select(SELECT_COLUMNS, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") {
    query = query.eq("status", filters.status);
  }
  if (filters.branchId && filters.branchId !== "all") {
    query = query.eq("branch_id", filters.branchId);
  }
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(
      `full_name.ilike.%${escaped}%,code.ilike.%${escaped}%,phone.ilike.%${escaped}%,email.ilike.%${escaped}%`,
    );
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: {
      rows: ((data ?? []) as unknown as GymMemberQueryRow[]).map(mapRow),
      total: count ?? 0,
    },
    error: null,
  };
}

export async function fetchGymMember(
  organizationId: string,
  memberId: string,
): Promise<OrgResult<GymMemberRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("gym_members")
    .select(SELECT_COLUMNS)
    .eq("organization_id", organizationId)
    .eq("id", memberId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That item could not be found." } };
  return { data: mapRow(data as unknown as GymMemberQueryRow), error: null };
}

export interface GymMemberWriteInput {
  organizationId: string;
  branchId: string;
  firstName: string;
  lastName: string;
  phone: string;
  email?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
  photoUrl?: string | null;
  emergencyContactName?: string | null;
  emergencyContactPhone?: string | null;
  notes?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  joinedAt?: string | null;
}

function rpcPayload(input: GymMemberWriteInput) {
  return {
    p_branch_id: input.branchId,
    p_first_name: input.firstName,
    p_last_name: input.lastName,
    p_phone: input.phone,
    p_email: input.email || null,
    p_gender: input.gender || null,
    p_date_of_birth: input.dateOfBirth || null,
    p_photo_url: input.photoUrl || null,
    p_emergency_contact_name: input.emergencyContactName || null,
    p_emergency_contact_phone: input.emergencyContactPhone || null,
    p_notes: input.notes || null,
    p_address_line1: input.addressLine1 || null,
    p_address_line2: input.addressLine2 || null,
    p_city: input.city || null,
    p_state: input.state || null,
    p_postal_code: input.postalCode || null,
    p_country: input.country || null,
    p_joined_at: input.joinedAt || null,
  };
}

export async function createGymMember(
  input: GymMemberWriteInput,
): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("create_gym_member", {
    p_org_id: input.organizationId,
    ...rpcPayload(input),
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: data as unknown as string }, error: null };
}

export async function updateGymMember(
  memberId: string,
  input: GymMemberWriteInput,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_gym_member", {
    p_member_id: memberId,
    ...rpcPayload(input),
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function setGymMemberStatus(
  memberId: string,
  status: GymMemberStatus,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("set_gym_member_status", {
    p_member_id: memberId,
    p_status: status,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}
