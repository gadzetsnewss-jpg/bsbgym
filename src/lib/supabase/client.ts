/**
 * Supabase browser client helpers.
 *
 * Uses `@supabase/ssr` so the session cookie is managed for us in the browser.
 * Returns `null` when Supabase is not configured (unauthenticated preview mode)
 * so the foundation still builds and runs without credentials.
 *
 * No fake credentials are ever generated - see `src/lib/env.ts`.
 */

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

let browserClient: SupabaseClient<Database> | null = null;

/**
 * Singleton Supabase browser client. Returns `null` when Supabase is not
 * configured so consumers can render a "not configured" state.
 */
export function getSupabaseBrowserClient(): SupabaseClient<Database> | null {
  if (!isSupabaseConfigured) return null;

  if (!browserClient) {
    browserClient = createBrowserClient<Database>(
      env.supabaseUrl as string,
      env.supabaseAnonKey as string,
    );
  }

  return browserClient;
}

/** True when this environment has real Supabase credentials. */
export { isSupabaseConfigured };
