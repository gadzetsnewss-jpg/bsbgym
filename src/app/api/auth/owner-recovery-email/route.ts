import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { ownerRecoveryEmailSchema } from "@/lib/validation/auth-schemas";
import { RECOVERY_EMAIL_TAKEN_MESSAGE } from "@/lib/auth/username";
import {
  isVerifiedRecoveryEmail,
  ownerEnrollmentRedirectTo,
} from "@/lib/auth/recovery";

const ENROLL_MESSAGE =
  "Check the inbox for that address and confirm it. Recovery email is not active until you verify it.";

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

  const parsed = ownerRecoveryEmailSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.issues[0]?.message || "Enter a real recovery email address." },
      { status: 400 },
    );
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Unable to update recovery email right now." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Your session has expired. Please sign in again." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const role = membership?.roles as unknown as { slug: string } | null;
  if (role?.slug !== "owner") {
    return NextResponse.json({ error: "You don't have permission to access this area." }, { status: 403 });
  }

  const nextEmail = parsed.data.email;
  if (isVerifiedRecoveryEmail(user.email, user.email_confirmed_at) && user.email?.toLowerCase() === nextEmail) {
    return NextResponse.json({ ok: true, message: "This recovery email is already verified." });
  }

  const origin = new URL(request.url).origin;
  const { error } = await supabase.auth.updateUser(
    { email: nextEmail },
    { emailRedirectTo: ownerEnrollmentRedirectTo(origin) },
  );
  if (error) {
    if (/already registered|already been registered|email_exists|duplicate/i.test(error.message)) {
      return NextResponse.json({ error: RECOVERY_EMAIL_TAKEN_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to update recovery email right now." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: ENROLL_MESSAGE });
}
