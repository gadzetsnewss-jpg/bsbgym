import { isUsableRecoveryEmail } from "@/lib/auth/username";
import type { createServerSupabaseAdmin } from "@/lib/supabase/server";

export { isUsableRecoveryEmail };

export const OWNER_SUPPORT_RECOVERY_PROCEDURE =
  "RECOVERY NOT ENROLLED. Self-service password reset is unavailable until a verified recovery email exists on the Auth user. Support must verify Owner identity out of band using legal business name, GSTIN, registered mobile last four digits, and the Owner username. Never reset from username, gym name, organization ID, or an unverified phone or email alone. After identity is proven, the Owner must sign in and enroll a recovery email; do not create a replacement Owner or organization.";

export const OWNER_RECOVERY_GENERIC_MESSAGE =
  "If an account exists for that Owner ID and a verified recovery email is on file, a password recovery link has been sent. The link expires shortly. If you do not receive an email, add a verified recovery email from Settings after you sign in, or contact support.";

export const OWNER_RECOVERY_RATE_LIMIT_MESSAGE = "Please try again later.";

const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX_HITS = 5;
const rateHits = new Map<string, number[]>();

export function consumeOwnerRecoveryRateLimit(key: string, now = Date.now()): boolean {
  const recent = (rateHits.get(key) ?? []).filter((stamp) => now - stamp < RATE_WINDOW_MS);
  if (recent.length >= RATE_MAX_HITS) {
    rateHits.set(key, recent);
    return false;
  }
  recent.push(now);
  rateHits.set(key, recent);
  return true;
}

export function ownerRecoveryClientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || request.headers.get("x-real-ip") || "unknown";
  return `owner-recovery:${ip}`;
}

export function isVerifiedRecoveryEmail(
  email: string | null | undefined,
  confirmedAt: string | null | undefined,
): boolean {
  if (!confirmedAt) return false;
  return isUsableRecoveryEmail(email);
}

export function maskRecoveryEmail(email: string | null | undefined): string | null {
  if (!email || !email.includes("@")) return null;
  const [local, domain] = email.trim().toLowerCase().split("@");
  if (!local || !domain) return null;
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

export function ownerEnrollmentRedirectTo(origin: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent("/settings/profile")}`;
}

export function ownerSignupConfirmRedirectTo(origin: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent("/onboarding")}`;
}

type AdminClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseAdmin>>>;

export type OwnerRecoveryStatus = "ready" | "not_found" | "not_owner" | "not_enrolled";

export async function resolveOwnerRecoveryTarget(
  admin: AdminClient,
  username: string,
): Promise<{ status: "ready"; email: string } | { status: Exclude<OwnerRecoveryStatus, "ready">; email: null }> {
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  if (profileError || !profile?.id) return { status: "not_found", email: null };

  const { data, error } = await admin.auth.admin.getUserById(profile.id);
  const user = data?.user;
  if (error || !user) return { status: "not_found", email: null };

  const { data: membership, error: membershipError } = await admin
    .from("organization_members")
    .select("roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (membershipError || !membership) return { status: "not_owner", email: null };

  const role = membership.roles as unknown as { slug: string } | null;
  if (role?.slug !== "owner") return { status: "not_owner", email: null };

  if (!isVerifiedRecoveryEmail(user.email, user.email_confirmed_at)) {
    return { status: "not_enrolled", email: null };
  }
  return { status: "ready", email: user.email as string };
}

export function ownerRecoveryRedirectTo(origin: string): string {
  return `${origin}/auth/callback?next=${encodeURIComponent("/owner/reset-password")}`;
}
