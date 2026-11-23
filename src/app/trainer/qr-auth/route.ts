import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { hashChallengeToken } from "@/lib/auth/trainer-qr";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const token = url.searchParams.get("token")?.trim();

  const baseUrl = url.origin;

  if (!token) {
    return NextResponse.redirect(new URL("/trainer/qr-auth/result?status=missing", baseUrl), 303);
  }

  // Preview mode fallback
  if (!isSupabaseConfigured || token.startsWith("mock-")) {
    const cookieStore = await cookies();
    cookieStore.set("bsb_portal", "trainer", {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });
    return NextResponse.redirect(new URL("/dashboard?auth=qr_success", baseUrl), 303);
  }

  const admin = await createServerSupabaseAdmin();
  if (!admin) {
    return NextResponse.redirect(
      new URL("/trainer/qr-auth/result?status=server_error", baseUrl),
      303,
    );
  }

  const clientIp =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown";
  const userAgent = request.headers.get("user-agent") || "unknown";

  type ChallengeRpcRow = {
    challenge_id: string;
    organization_id: string;
    trainer_id: string;
    user_id: string;
    trainer_name: string;
    trainer_code: string;
    auth_email: string;
  };

  const tokenHash = hashChallengeToken(token);

  // Consume challenge atomically in database
  const { data: rpcData, error: rpcError } = await (admin as any).rpc("consume_trainer_qr_challenge", {
    p_token_hash: tokenHash,
    p_ip: clientIp,
    p_user_agent: userAgent,
  });

  const challenges = rpcData as ChallengeRpcRow[] | null;

  if (rpcError || !challenges || challenges.length === 0) {
    const errorMsg = rpcError?.message?.toLowerCase() || "";
    let reason = "invalid";
    if (errorMsg.includes("expired")) {
      reason = "expired";
    } else if (errorMsg.includes("already been used")) {
      reason = "already_used";
    } else if (errorMsg.includes("revoked")) {
      reason = "revoked";
    }
    return NextResponse.redirect(
      new URL(`/trainer/qr-auth/result?status=${reason}`, baseUrl),
      303,
    );
  }

  const challenge = challenges[0];
  const authEmail = challenge.auth_email;

  if (!authEmail) {
    return NextResponse.redirect(
      new URL("/trainer/qr-auth/result?status=no_email", baseUrl),
      303,
    );
  }

  try {
    // Generate secure single-use magiclink OTP for this verified trainer
    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: authEmail,
    });

    if (linkError || !linkData?.properties?.hashed_token) {
      return NextResponse.redirect(
        new URL("/trainer/qr-auth/result?status=auth_failed", baseUrl),
        303,
      );
    }

    // Verify OTP using caller's request cookies to establish session
    const supabase = await createServerSupabase();
    if (!supabase) {
      return NextResponse.redirect(
        new URL("/trainer/qr-auth/result?status=server_error", baseUrl),
        303,
      );
    }

    const { error: verifyError } = await supabase.auth.verifyOtp({
      token_hash: linkData.properties.hashed_token,
      type: "magiclink",
    });

    if (verifyError) {
      return NextResponse.redirect(
        new URL("/trainer/qr-auth/result?status=session_failed", baseUrl),
        303,
      );
    }

    // Set portal cookie
    const cookieStore = await cookies();
    cookieStore.set("bsb_portal", "trainer", {
      path: "/",
      maxAge: 30 * 24 * 60 * 60,
      sameSite: "lax",
    });

    // Safe audit logging (never logs tokens)
    console.info(
      JSON.stringify({
        scope: "trainer-qr-login",
        status: "success",
        trainerId: challenge.trainer_id,
        organizationId: challenge.organization_id,
        timestamp: new Date().toISOString(),
      }),
    );

    // Redirect mobile device directly to Trainer Dashboard
    return NextResponse.redirect(new URL("/dashboard", baseUrl), 303);
  } catch (err: unknown) {
    console.error("Trainer QR auth exception:", err);
    return NextResponse.redirect(
      new URL("/trainer/qr-auth/result?status=server_error", baseUrl),
      303,
    );
  }
}
