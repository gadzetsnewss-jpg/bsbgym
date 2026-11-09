/**
 * Centralized environment variable access.
 *
 * Phase 3 uses these values for Supabase Auth and the organization database.
 * When no credentials are configured the app falls back to preview mode
 * (unauthenticated, no data) so the foundation still builds and runs.
 *
 * IMPORTANT: `NEXT_PUBLIC_*` variables must be referenced statically
 * (`process.env.NEXT_PUBLIC_X`) so Next.js can inline them into the client
 * bundle. Dynamic access (`process.env[name]`) is not inlined and would read
 * as `undefined` in the browser, which breaks the "is Supabase configured"
 * check on the client. Server-only values live in `src/lib/server-env.ts`
 * and must never be imported from a client component.
 */

export const env = {
  appName: process.env.NEXT_PUBLIC_APP_NAME || "BSB FitForge",
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
} as const;

/** True when a Supabase project has been configured for this environment. */
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);
