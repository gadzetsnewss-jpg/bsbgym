/**
 * Centralized environment variable access.
 *
 * Phase 0 runs on mock data; these values are read lazily and never used yet.
 * Phase 1 will read the real Supabase project values from these variables.
 *
 * IMPORTANT: Only `NEXT_PUBLIC_*` variables are safe to reference in client
 * components. Server-only values live behind the `server()` accessor.
 */

const readEnv = (name: string): string | undefined => {
  if (typeof process === "undefined") return undefined;
  return process.env[name];
};

export const env = {
  appName: readEnv("NEXT_PUBLIC_APP_NAME") || "BSB FitForge",
  supabaseUrl: readEnv("NEXT_PUBLIC_SUPABASE_URL") || undefined,
  supabaseAnonKey: readEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY") || undefined,
} as const;

/** Server-only environment values. Never import from a client component. */
export const serverEnv = {
  supabaseServiceRoleKey: readEnv("SUPABASE_SERVICE_ROLE_KEY") || undefined,
} as const;

/** True when a Supabase project has been configured for this environment. */
export const isSupabaseConfigured = Boolean(
  env.supabaseUrl && env.supabaseAnonKey,
);
