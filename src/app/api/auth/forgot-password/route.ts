import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { normalizeUsername } from "@/lib/auth/username";
import { forgotPasswordSchema } from "@/lib/validation/auth-schemas";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true });
  }

  const parsed = forgotPasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const username = normalizeUsername(parsed.data.username);
  const admin = await createServerSupabaseAdmin();
  const supabase = await createServerSupabase();
  if (!admin || !supabase) {
    return NextResponse.json({ ok: true });
  }

  const { data: email } = await admin.rpc("auth_email_for_username", {
    p_username: username,
  });

  if (email) {
    const origin = new URL(request.url).origin;
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${origin}/reset-password`,
    });
  }

  return NextResponse.json({ ok: true });
}
