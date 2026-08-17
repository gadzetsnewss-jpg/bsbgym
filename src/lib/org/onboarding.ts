/**
 * Onboarding service (Phase 3).
 *
 * Wraps the `create_organization` RPC - a single SECURITY DEFINER transaction
 * that creates the organization, system roles, owner membership, owner branch
 * access and the first branch atomically.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { OrgResult } from "@/lib/org/members";

export interface OnboardingAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface CreateOrganizationInput {
  name: string;
  legalName?: string;
  businessType?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  address: OnboardingAddress;
  branch: {
    name: string;
    code: string;
    phone?: string;
    email?: string;
    timezone: string;
    address: OnboardingAddress;
  };
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<OrgResult<{ organizationId: string }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.rpc("create_organization", {
    p_name: input.name,
    p_legal_name: input.legalName || null,
    p_business_type: input.businessType || null,
    p_email: input.email || null,
    p_phone: input.phone || null,
    p_website: input.website || null,
    p_address_line1: input.address.addressLine1 || null,
    p_address_line2: input.address.addressLine2 || null,
    p_city: input.address.city || null,
    p_state: input.address.state || null,
    p_postal_code: input.address.postalCode || null,
    p_country: input.address.country || null,
    p_tax_id: input.taxId || null,
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_date_format: input.dateFormat,
    p_logo_url: null,
    p_branch_name: input.branch.name,
    p_branch_code: input.branch.code,
    p_branch_phone: input.branch.phone || null,
    p_branch_email: input.branch.email || null,
    p_branch_address_line1: input.branch.address.addressLine1 || null,
    p_branch_address_line2: input.branch.address.addressLine2 || null,
    p_branch_city: input.branch.address.city || null,
    p_branch_state: input.branch.address.state || null,
    p_branch_postal_code: input.branch.address.postalCode || null,
    p_branch_country: input.branch.address.country || null,
    p_branch_timezone: input.branch.timezone,
  });

  if (error) {
    return {
      data: null,
      error: { message: error.message ?? "Unable to create your organization." },
    };
  }

  return { data: { organizationId: data as unknown as string }, error: null };
}
