import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { changePasswordSchema } from "@/lib/validation/auth-schemas";

export async function POST(request: Request) {
  if (!isSupabaseConfigured) {
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const parsed = changePasswordSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Please check your details and try again." }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  const admin = await createServerSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 400 });
  }

  const { error: flagError } = await admin.rpc("complete_password_change", { p_user_id: user.id });
  if (flagError) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
