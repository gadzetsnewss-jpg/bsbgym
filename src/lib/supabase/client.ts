/**
 * Supabase client helpers (Phase 1).
 *
 * These helpers are intentionally small and unused during Phase 0.
 * They only create a Supabase client when real environment variables exist,
 * so the foundation builds and runs cleanly without credentials.
 *
 * No fake credentials are ever generated - see `src/lib/env.ts`.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Singleton Supabase client for browser components.
 * Returns `null` when Supabase is not yet configured (Phase 0).
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

  if (!browserClient) {
    browserClient = createClient<Database>(
      env.supabaseUrl as string,
      env.supabaseAnonKey as string,
    );
  }

  return browserClient;
}
