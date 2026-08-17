import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Auth callback - handles one-time code exchange (email confirmation,
 * password reset links that route through /auth/callback).
 * Redirects to onboarding when the user has no organization yet.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  const safeNext =
    next.startsWith("/") && !next.startsWith("//") ? next : "/dashboard";

  if (!isSupabaseConfigured) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const supabase = await createServerSupabase();
  if (!supabase || !code) {
    return NextResponse.redirect(`${origin}/login`);
  }

  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) {
    return NextResponse.redirect(`${origin}/login`);
  }

  // Route the user to their next step based on organization state.
  const { data: member } = await supabase
    .from("organization_members")
    .select("id")
    .eq("status", "active")
    .maybeSingle();

  const destination = member ? safeNext : "/onboarding";
  return NextResponse.redirect(`${origin}${destination}`);
}
