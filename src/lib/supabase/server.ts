/**
 * Supabase server client helpers for Server Components / Route Handlers /
 * Server Actions (Next.js App Router).
 *
 * Session cookies are managed via `@supabase/ssr`'s `createServerClient` using
 * the request cookie store from `next/headers`. Returns `null` when Supabase
 * is not configured so the app still runs in preview mode.
 */

import { createServerClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { env, serverEnv, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/** Async Supabase server client bound to the current request's cookies. */
export async function createServerSupabase(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return null;

  const cookieStore = await cookies();

  return createServerClient<Database>(
    env.supabaseUrl as string,
    env.supabaseAnonKey as string,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // The `setAll` method was called from a Server Component; this
            // can be ignored as cookies would need to be set via middleware.
          }
        },
      },
    },
  );
}

/** Server client with the service-role key (server-side only, never exposed). */
export async function createServerSupabaseAdmin(): Promise<SupabaseClient<Database> | null> {
  if (!isSupabaseConfigured) return null;

  return createServerClient<Database>(
    env.supabaseUrl as string,
    (serverEnv.supabaseServiceRoleKey ?? env.supabaseAnonKey) as string,
    {
      cookies: {
        getAll: () => [],
        setAll: () => {},
      },
    },
  );
}

export { isSupabaseConfigured };
