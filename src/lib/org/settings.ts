/**
 * Organization, branch and settings services.
 *
 * Mutations go through SECURITY DEFINER RPCs (`update_organization`,
 * `update_organization_preferences`, `create_branch`, `update_branch`,
 * `set_branch_status`, `upsert_organization_setting`). organization_id is
 * never the only gate: the RPCs re-check owner/admin from auth.uid(). RLS
 * remains the boundary.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { BranchStatus, Json } from "@/lib/supabase/types";
import type { OrgResult } from "@/lib/org/members";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

export interface UpdateOrganizationInput {
  organizationId: string;
  name: string;
  legalName?: string | null;
  businessType?: string | null;
  email?: string | null;
  phone?: string | null;
  website?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  taxId?: string | null;
  gstin?: string | null;
  currency?: string | null;
  timezone?: string | null;
  dateFormat?: string | null;
  logoUrl?: string | null;
}

export interface UpdateOrganizationPreferencesInput {
  organizationId: string;
  currency: string;
  timezone: string;
  dateFormat: string;
}

export async function updateOrganizationPreferences(
  input: UpdateOrganizationPreferencesInput,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_organization_preferences", {
    p_org_id: input.organizationId,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_date_format: input.dateFormat,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function updateOrganization(input: UpdateOrganizationInput): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_organization", {
    p_org_id: input.organizationId,
    p_name: input.name,
    p_legal_name: input.legalName || null,
    p_business_type: input.businessType || null,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_website: input.website || null,
    p_address_line1: input.addressLine1 || null,
    p_address_line2: input.addressLine2 || null,
    p_city: input.city || null,
    p_state: input.state || null,
    p_postal_code: input.postalCode || null,
    p_country: input.country || null,
    p_tax_id: input.taxId || null,
    p_gstin: input.gstin || null,
    p_currency: input.currency || null,
    p_timezone: input.timezone || null,
    p_date_format: input.dateFormat || null,
    p_logo_url: input.logoUrl || null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export interface OrgBranchRow {
  id: string;
  name: string;
  code: string;
  gstin: string | null;
  phone: string | null;
  email: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  timezone: string;
  status: BranchStatus;
}

export async function fetchOrgBranchRows(
  organizationId: string,
): Promise<OrgResult<OrgBranchRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("branches")
    .select(
      "id, name, code, gstin, phone, email, address_line1, address_line2, city, state, postal_code, country, timezone, status",
    )
    .eq("organization_id", organizationId)
    .order("name");
  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const rows: OrgBranchRow[] = (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    code: row.code,
    gstin: row.gstin,
    phone: row.phone,
    email: row.email,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    timezone: row.timezone,
    status: row.status,
  }));
  return { data: rows, error: null };
}

export interface CreateBranchInput {
  organizationId: string;
  name: string;
  code: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  timezone: string;
}

export async function createBranch(input: CreateBranchInput): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.rpc("create_branch", {
    p_org_id: input.organizationId,
    p_name: input.name,
    p_code: input.code,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_gstin: input.gstin || null,
    p_address_line1: input.addressLine1 || null,
    p_address_line2: input.addressLine2 || null,
    p_city: input.city || null,
    p_state: input.state || null,
    p_postal_code: input.postalCode || null,
    p_country: input.country || null,
    p_timezone: input.timezone,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: data as unknown as string }, error: null };
}

export interface UpdateBranchInput {
  branchId: string;
  name: string;
  phone?: string | null;
  email?: string | null;
  gstin?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  state?: string | null;
  postalCode?: string | null;
  country?: string | null;
  timezone?: string | null;
}

export async function updateBranch(input: UpdateBranchInput): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("update_branch", {
    p_branch_id: input.branchId,
    p_name: input.name,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_gstin: input.gstin || null,
    p_address_line1: input.addressLine1 || null,
    p_address_line2: input.addressLine2 || null,
    p_city: input.city || null,
    p_state: input.state || null,
    p_postal_code: input.postalCode || null,
    p_country: input.country || null,
    p_timezone: input.timezone || null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function setBranchStatus(
  branchId: string,
  status: BranchStatus,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("set_branch_status", {
    p_branch_id: branchId,
    p_status: status,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export interface OrganizationSettingRow {
  key: string;
  value: Json;
}

export function settingValueAsRecord(value: Json | null | undefined): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

export async function fetchOrganizationSetting(
  organizationId: string,
  key: string,
): Promise<OrgResult<Json>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("organization_settings")
    .select("setting_value")
    .eq("organization_id", organizationId)
    .eq("setting_key", key)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: data?.setting_value ?? {}, error: null };
}

export async function fetchOrganizationSettings(
  organizationId: string,
): Promise<OrgResult<OrganizationSettingRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase
    .from("organization_settings")
    .select("setting_key, setting_value")
    .eq("organization_id", organizationId)
    .order("setting_key");
  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  return {
    data: (data ?? []).map((row) => ({
      key: row.setting_key,
      value: row.setting_value,
    })),
    error: null,
  };
}

export async function upsertOrganizationSetting(
  organizationId: string,
  key: string,
  value: Json,
): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.rpc("upsert_organization_setting", {
    p_org_id: organizationId,
    p_setting_key: key,
    p_setting_value: value,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}
