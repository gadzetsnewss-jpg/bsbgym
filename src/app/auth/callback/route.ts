import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Auth callback - handles one-time code exchange for password-reset
 * links that route through /auth/callback.
 * Redirects to onboarding when the user has no organization yet.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";
  const isOwnerRecovery = safeNext === "/owner/reset-password";
  const isOwnerEnrollment = safeNext === "/settings/profile";
  const failPath = isOwnerRecovery ? "/owner/forgot-password" : "/login";

  if (!isSupabaseConfigured) {
    return NextResponse.redirect(`${origin}${failPath}`);
  }

  const supabase = await createServerSupabase();
  if (!supabase || !code) {
    return NextResponse.redirect(`${origin}${failPath}`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}${failPath}`);
  }

  if (isOwnerRecovery || isOwnerEnrollment) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  const destination = member ? safeNext : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
