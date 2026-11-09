/**
 * Server-only environment values. Never import from a client component.
 *
 * Next.js/Vercel only injects non-public env vars into serverless functions
 * when they are referenced as a static `process.env.NAME` identifier.
 * Read at call time so production Node runtimes pick up host env after deploy.
 */

export function getSupabaseServiceRoleKey(): string | undefined {
  const value = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export const serverEnv = {
  get supabaseServiceRoleKey() {
    return getSupabaseServiceRoleKey();
  },
};
