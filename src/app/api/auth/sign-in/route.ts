import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { GENERIC_CREDENTIALS_MESSAGE, normalizeUsername } from "@/lib/auth/username";
import { loginSchema } from "@/lib/validation/auth-schemas";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_CREDENTIALS_MESSAGE }, { status: 400 });
  }

  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: GENERIC_CREDENTIALS_MESSAGE }, { status: 400 });
  }

  const username = normalizeUsername(parsed.data.username);
  const admin = await createServerSupabaseAdmin();
  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  if (!admin) {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }

  const { data: email, error: lookupError } = await admin.rpc("auth_email_for_username", {
    p_username: username,
  });

  if (lookupError) {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }
  if (!email) {
    return NextResponse.json({ error: GENERIC_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });

  if (error || !data.user) {
    return NextResponse.json({ error: GENERIC_CREDENTIALS_MESSAGE }, { status: 401 });
  }

  return NextResponse.json({ ok: true, userId: data.user.id });
}
