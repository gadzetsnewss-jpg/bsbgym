/**
 * Supabase middleware helper (Next.js middleware).
 *
 * Refreshes the session cookie on every protected request and exposes a typed
 * client for the middleware. Returns `null` when Supabase is not configured so
 * preview mode remains fully functional.
 */

import { createServerClient } from "@supabase/ssr";
import { type NextRequest, NextResponse } from "next/server";
import { env, isSupabaseConfigured } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

/**
 * Creates a Supabase client inside middleware and refreshes the session
 * cookies. Call `updateSession` for every request the middleware handles.
 */
export async function updateSession(
  request: NextRequest,
  response: NextResponse,
): Promise<SupabaseMiddlewareClient | null> {
  if (!isSupabaseConfigured) return null;

  const supabase = createServerClient<Database>(
    env.supabaseUrl as string,
    env.supabaseAnonKey as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: refreshing the session triggers a write to the cookie so
  // it must happen before returning the response.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, response, user };
}

export interface SupabaseMiddlewareClient {
  supabase: ReturnType<typeof createServerClient<Database>>;
  response: NextResponse;
  user: { id: string; email?: string | null } | null;
}
