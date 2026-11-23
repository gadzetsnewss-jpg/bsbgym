import crypto from "crypto";
import QRCode from "qrcode";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export interface GeneratedQrResult {
  challengeId: string;
  token: string;
  authUrl: string;
  qrSvg: string;
  expiresAt: string;
  expiresInSeconds: number;
  trainerName: string;
  trainerCode: string | null;
  organizationName: string;
}

export interface QrStatusResult {
  challengeId: string;
  status: "active" | "consumed" | "expired" | "revoked";
  expiresAt: string;
  consumedAt: string | null;
  expiresInSeconds: number;
}

/**
 * Computes SHA-256 hash of opaque challenge token.
 */
export function hashChallengeToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Generates an SVG string for a given URL using standard ISO/IEC 18004 QR.
 */
export async function generateQrSvg(url: string, size = 260): Promise<string> {
  return QRCode.toString(url, {
    type: "svg",
    margin: 2,
    width: size,
    errorCorrectionLevel: "M",
    color: {
      dark: "#063C3B",
      light: "#FFFFFF",
    },
  });
}

/**
 * Server action / helper: Generates a 90-second single-use QR login challenge for an authorized trainer.
 * Requires caller to be an Owner or Admin of the gym.
 */
export async function createTrainerQrChallenge(
  trainerId: string,
  origin: string,
): Promise<{ data: GeneratedQrResult | null; error: string | null }> {
  if (!isSupabaseConfigured) {
    // Preview / demo mode mock challenge
    const token = crypto.randomBytes(32).toString("hex");
    const authUrl = `${origin}/trainer/qr-auth?token=${token}`;
    const qrSvg = await generateQrSvg(authUrl);
    const expiresAt = new Date(Date.now() + 90 * 1000).toISOString();
    return {
      data: {
        challengeId: "mock-" + crypto.randomUUID(),
        token,
        authUrl,
        qrSvg,
        expiresAt,
        expiresInSeconds: 90,
        trainerName: "Trainer",
        trainerCode: "TR-001",
        organizationName: "BSB FitForge Demo",
      },
      error: null,
    };
  }

  const supabase = await createServerSupabase();
  const admin = await createServerSupabaseAdmin();
  if (!supabase || !admin) {
    return { data: null, error: "Database service is unavailable." };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { data: null, error: "Authentication required." };
  }

  // Get caller's active organization & role
  const { data: memberData } = await admin
    .from("organization_members")
    .select("organization_id, roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!memberData) {
    return { data: null, error: "You do not belong to an active organization." };
  }

  const roleSlug = (memberData.roles as unknown as { slug: string } | null)?.slug?.toLowerCase();
  if (roleSlug !== "owner" && roleSlug !== "admin") {
    return {
      data: null,
      error: "Access denied: Only gym owners and administrators can generate QR logins.",
    };
  }

  const orgId = memberData.organization_id;

  // Verify trainer belongs to org and has a linked user_id
  const { data: trainerData, error: trainerError } = await admin
    .from("trainers")
    .select("id, organization_id, code, first_name, last_name, full_name, user_id, organizations(name)")
    .eq("id", trainerId)
    .eq("organization_id", orgId)
    .maybeSingle();

  if (trainerError || !trainerData) {
    return { data: null, error: "Trainer record not found in your organization." };
  }

  if (!trainerData.user_id) {
    return {
      data: null,
      error: "Trainer does not have an active login account. Create their login first under Login Access.",
    };
  }

  // Generate 32 bytes cryptographically secure single-use token
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = hashChallengeToken(rawToken);

  // Call database RPC to atomically revoke any prior active challenge and insert new one
  type CreatedRpcRow = {
    challenge_id: string;
    organization_id: string;
    trainer_id: string;
    user_id: string;
    expires_at: string;
    status: string;
  };

  const { data: rpcData, error: rpcError } = await (admin as any).rpc("create_trainer_qr_challenge", {
    p_org_id: orgId,
    p_trainer_id: trainerId,
    p_token_hash: tokenHash,
    p_expires_in_seconds: 90,
  });

  const challenges = rpcData as CreatedRpcRow[] | null;

  if (rpcError || !challenges || challenges.length === 0) {
    return {
      data: null,
      error: rpcError?.message || "Failed to create QR challenge in database.",
    };
  }

  const challenge = challenges[0];
  const authUrl = `${origin}/trainer/qr-auth?token=${rawToken}`;
  const qrSvg = await generateQrSvg(authUrl);

  const trainerName =
    trainerData.full_name?.trim() ||
    [trainerData.first_name, trainerData.last_name].filter(Boolean).join(" ").trim() ||
    "Trainer";

  const orgRecord = trainerData.organizations as unknown as { name: string } | null;
  const organizationName = orgRecord?.name || "BSB FitForge";

  return {
    data: {
      challengeId: challenge.challenge_id,
      token: rawToken,
      authUrl,
      qrSvg,
      expiresAt: challenge.expires_at,
      expiresInSeconds: 90,
      trainerName,
      trainerCode: trainerData.code,
      organizationName,
    },
    error: null,
  };
}

/**
 * Checks the status of an existing QR challenge.
 */
export async function getTrainerQrChallengeStatus(
  challengeId: string,
): Promise<{ data: QrStatusResult | null; error: string | null }> {
  if (!isSupabaseConfigured || challengeId.startsWith("mock-")) {
    return {
      data: {
        challengeId,
        status: "active",
        expiresAt: new Date(Date.now() + 60 * 1000).toISOString(),
        consumedAt: null,
        expiresInSeconds: 60,
      },
      error: null,
    };
  }

  const admin = await createServerSupabaseAdmin();
  if (!admin) return { data: null, error: "Database service unavailable." };

  type ChallengeStatusRow = {
    id: string;
    status: string;
    expires_at: string;
    consumed_at: string | null;
  };

  const { data, error } = await (admin as any)
    .from("trainer_qr_challenges")
    .select("id, status, expires_at, consumed_at")
    .eq("id", challengeId)
    .maybeSingle();

  const record = data as ChallengeStatusRow | null;

  if (error || !record) {
    return { data: null, error: "Challenge not found." };
  }

  const now = new Date();
  const expiresAt = new Date(record.expires_at);
  let status = record.status as "active" | "consumed" | "expired" | "revoked";

  if (status === "active" && expiresAt.getTime() <= now.getTime()) {
    status = "expired";
    // Opportunistically mark expired in DB
    await (admin as any).from("trainer_qr_challenges").update({ status: "expired" }).eq("id", challengeId);
  }

  const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));

  return {
    data: {
      challengeId: record.id,
      status,
      expiresAt: record.expires_at,
      consumedAt: record.consumed_at,
      expiresInSeconds: remainingSeconds,
    },
    error: null,
  };
}

/**
 * Revokes active QR challenge for a trainer.
 */
export async function revokeTrainerQrChallenge(
  trainerId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: true, error: null };
  }

  const supabase = await createServerSupabase();
  const admin = await createServerSupabaseAdmin();
  if (!supabase || !admin) return { success: false, error: "Database service unavailable." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Authentication required." };

  const { data: memberData } = await admin
    .from("organization_members")
    .select("organization_id, roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!memberData) return { success: false, error: "No active organization found." };
  const roleSlug = (memberData.roles as unknown as { slug: string } | null)?.slug?.toLowerCase();
  if (roleSlug !== "owner" && roleSlug !== "admin") {
    return { success: false, error: "Access denied: Only owners and admins can revoke QR logins." };
  }

  const { error } = await (admin as any).rpc("revoke_trainer_qr_challenge", {
    p_org_id: memberData.organization_id,
    p_trainer_id: trainerId,
  });

  if (error) return { success: false, error: error.message };
  return { success: true, error: null };
}

/**
 * Revokes all active device sessions for a trainer by signing out their auth account and revoking challenges.
 */
export async function revokeTrainerDeviceSessions(
  trainerId: string,
): Promise<{ success: boolean; error: string | null }> {
  if (!isSupabaseConfigured) {
    return { success: true, error: null };
  }

  const supabase = await createServerSupabase();
  const admin = await createServerSupabaseAdmin();
  if (!supabase || !admin) return { success: false, error: "Database service unavailable." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { success: false, error: "Authentication required." };

  const { data: memberData } = await admin
    .from("organization_members")
    .select("organization_id, roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!memberData) return { success: false, error: "No active organization found." };
  const roleSlug = (memberData.roles as unknown as { slug: string } | null)?.slug?.toLowerCase();
  if (roleSlug !== "owner" && roleSlug !== "admin") {
    return {
      success: false,
      error: "Access denied: Only owners and admins can revoke device sessions.",
    };
  }

  // Find trainer linked user_id
  const { data: trainer } = await admin
    .from("trainers")
    .select("user_id")
    .eq("id", trainerId)
    .eq("organization_id", memberData.organization_id)
    .maybeSingle();

  if (trainer?.user_id) {
    // Revoke all QR challenges
    await (admin as any).rpc("revoke_trainer_qr_challenge", {
      p_org_id: memberData.organization_id,
      p_trainer_id: trainerId,
    });

    // Invalidate user sessions in Supabase Auth Admin
    try {
      await admin.auth.admin.signOut(trainer.user_id, "global");
    } catch {
      // Fall through if already signed out
    }
  }

  return { success: true, error: null };
}
