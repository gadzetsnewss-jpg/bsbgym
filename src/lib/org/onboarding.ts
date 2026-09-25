/**
 * Onboarding service (Phase 3).
 *
 * Each Continue writes through a SECURITY DEFINER RPC. Identity and the draft
 * organization always come from auth.uid() - the client never sends org or
 * branch ids. Complete calls create_organization, which UPDATEs the draft
 * instead of inserting a second organization.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { Json } from "@/lib/supabase/types";
import type { OrgResult } from "@/lib/org/members";

export interface OnboardingAddress {
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  postalCode?: string;
  country?: string;
}

export interface OnboardingBusinessInput {
  name: string;
  legalName?: string;
  businessType?: string;
  email?: string;
  phone?: string;
  website?: string;
  taxId?: string;
  address: OnboardingAddress;
}

export interface OnboardingBranchInput {
  name: string;
  code: string;
  phone?: string;
  email?: string;
  timezone: string;
  address: OnboardingAddress;
}

export interface OnboardingPreferencesInput {
  currency: string;
  timezone: string;
  dateFormat: string;
}

export interface OnboardingDraftState {
  id: string | null;
  step: number;
  firstName: string;
  lastName: string;
  name: string;
  legalName: string;
  businessType: string;
  email: string;
  phone: string;
  website: string;
  taxId: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  currency: string;
  timezone: string;
  dateFormat: string;
  branch: {
    name: string;
    code: string;
    phone: string;
    email: string;
    timezone: string;
    addressLine1: string;
    addressLine2: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
}

export interface CreateOrganizationInput extends OnboardingBusinessInput {
  currency: string;
  timezone: string;
  dateFormat: string;
  branch: OnboardingBranchInput;
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function clientOrNull() {
  return getSupabaseBrowserClient();
}

export async function fetchOnboardingOrganization(): Promise<
  OrgResult<OnboardingDraftState | null>
> {
  const supabase = clientOrNull();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.rpc("get_onboarding_organization");
  if (error) {
    return { data: null, error: { message: friendlyMessage(error) } };
  }
  if (data == null) {
    return { data: null, error: null };
  }

  const row = asRecord(data as Json);
  const branch = asRecord(row.branch);
  const stepRaw = row.step;
  const step = typeof stepRaw === "number" ? stepRaw : Number(stepRaw) || 0;

  return {
    data: {
      id: asText(row.id) || null,
      step,
      firstName: asText(row.first_name),
      lastName: asText(row.last_name),
      name: asText(row.name),
      legalName: asText(row.legal_name),
      businessType: asText(row.business_type),
      email: asText(row.email),
      phone: asText(row.phone),
      website: asText(row.website),
      taxId: asText(row.tax_id),
      addressLine1: asText(row.address_line1),
      addressLine2: asText(row.address_line2),
      city: asText(row.city),
      state: asText(row.state),
      postalCode: asText(row.postal_code),
      country: asText(row.country),
      currency: asText(row.currency),
      timezone: asText(row.timezone),
      dateFormat: asText(row.date_format),
      branch: {
        name: asText(branch.name),
        code: asText(branch.code),
        phone: asText(branch.phone),
        email: asText(branch.email),
        timezone: asText(branch.timezone),
        addressLine1: asText(branch.address_line1),
        addressLine2: asText(branch.address_line2),
        city: asText(branch.city),
        state: asText(branch.state),
        postalCode: asText(branch.postal_code),
        country: asText(branch.country),
      },
    },
    error: null,
  };
}

export async function saveOnboardingAccount(input: {
  firstName: string;
  lastName: string;
}): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { error } = await supabase.rpc("save_onboarding_account", {
    p_first_name: input.firstName,
    p_last_name: input.lastName,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function saveOnboardingBusiness(
  input: OnboardingBusinessInput,
): Promise<OrgResult<{ organizationId: string }>> {
  const supabase = clientOrNull();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.rpc("save_onboarding_business", {
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
  });

  if (error) {
    return { data: null, error: { message: friendlyMessage(error) } };
  }

  return { data: { organizationId: data as unknown as string }, error: null };
}

export async function saveOnboardingBranch(
  input: OnboardingBranchInput,
): Promise<OrgResult<{ organizationId: string }>> {
  const supabase = clientOrNull();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.rpc("save_onboarding_branch", {
    p_name: input.name,
    p_code: input.code,
    p_phone: input.phone || null,
    p_email: input.email || null,
    p_timezone: input.timezone,
    p_address_line1: input.address.addressLine1 || null,
    p_address_line2: input.address.addressLine2 || null,
    p_city: input.address.city || null,
    p_state: input.address.state || null,
    p_postal_code: input.address.postalCode || null,
    p_country: input.address.country || null,
  });

  if (error) {
    return { data: null, error: { message: friendlyMessage(error) } };
  }

  return { data: { organizationId: data as unknown as string }, error: null };
}

export async function saveOnboardingPreferences(
  input: OnboardingPreferencesInput,
): Promise<OrgResult<{ organizationId: string }>> {
  const supabase = clientOrNull();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.rpc("save_onboarding_preferences", {
    p_currency: input.currency,
    p_timezone: input.timezone,
    p_date_format: input.dateFormat,
  });

  if (error) {
    return { data: null, error: { message: friendlyMessage(error) } };
  }

  return { data: { organizationId: data as unknown as string }, error: null };
}

export async function createOrganization(
  input: CreateOrganizationInput,
): Promise<OrgResult<{ organizationId: string }>> {
  const supabase = clientOrNull();
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
    return { data: null, error: { message: friendlyMessage(error) } };
  }

  return { data: { organizationId: data as unknown as string }, error: null };
}
