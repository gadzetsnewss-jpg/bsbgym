import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeUsername } from "@/lib/auth/username";
import { forgotPasswordSchema } from "@/lib/validation/auth-schemas";
import {
  OWNER_RECOVERY_GENERIC_MESSAGE,
  OWNER_RECOVERY_RATE_LIMIT_MESSAGE,
  consumeOwnerRecoveryRateLimit,
  ownerRecoveryClientKey,
  ownerRecoveryRedirectTo,
  resolveOwnerRecoveryTarget,
} from "@/lib/auth/recovery";

function ok() {
  return NextResponse.json({ ok: true, message: OWNER_RECOVERY_GENERIC_MESSAGE });
}

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  if (!consumeOwnerRecoveryRateLimit(ownerRecoveryClientKey(request))) {
    return NextResponse.json({ error: OWNER_RECOVERY_RATE_LIMIT_MESSAGE }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return ok();
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) return ok();

  const username = normalizeUsername(parsed.data.username);
  const admin = await createServerSupabaseAdmin();
  const supabase = await createServerSupabase();
  if (!admin || !supabase) return ok();

  const target = await resolveOwnerRecoveryTarget(admin, username);
  if (target.status !== "ready") return ok();

  const origin = new URL(request.url).origin;
  await supabase.auth.resetPasswordForEmail(target.email, {
    redirectTo: ownerRecoveryRedirectTo(origin),
  });

  return ok();
}
