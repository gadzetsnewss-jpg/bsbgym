/**
 * Supabase server helpers (Phase 1).
 *
 * Used by Server Components / Route Handlers / Server Actions.
 * Returns `null` when Supabase is not configured so Phase 0 stays clean.
 *
 * TODO(Phase 1): wire the session cookie helpers from `@supabase/ssr`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, serverEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function getSupabaseServerClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

  const key = serverEnv.supabaseServiceRoleKey ?? env.supabaseAnonKey;
  return createClient<Database>(env.supabaseUrl as string, key as string);
}
