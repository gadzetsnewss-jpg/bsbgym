/**
 * Profile service (Phase 3).
 *
 * Users can only ever update their OWN profile row - enforced both by the
 * RLS policy (`profiles` update WHERE auth.uid() = id) and by always passing
 * the signed-in user's id here. Organization ownership, roles, permissions
 * and protected settings are never editable through this surface.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { Json } from "@/lib/supabase/types";
import type { OrgResult } from "@/lib/org/members";

export interface UpdateProfileInput {
  profileId: string;
  firstName: string;
  lastName: string;
  phone?: string | null;
  avatarUrl?: string | null;
  preferences?: Json;
}

export async function updateProfile(input: UpdateProfileInput): Promise<OrgResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { error } = await supabase
    .from("profiles")
    .update({
      first_name: input.firstName.trim(),
      last_name: input.lastName.trim(),
      phone: input.phone?.trim() || null,
      avatar_url: input.avatarUrl?.trim() || null,
      ...(input.preferences ? { preferences: input.preferences } : {}),
    })
    .eq("id", input.profileId);

  if (error) {
    return { data: null, error: { message: error.message ?? "Unable to update your profile." } };
  }
  return { data: undefined, error: null };
}
