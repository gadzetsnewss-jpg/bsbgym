import { NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { resetPasswordSchema } from "@/lib/validation/auth-schemas";

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

  const parsed = resetPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues.find((issue) => issue.path[0] === "confirmPassword")?.message ||
      parsed.error.issues.find((issue) => issue.path[0] === "password")?.message ||
      "Please check your details and try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const supabase = await createServerSupabase();
  if (!supabase) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 503 });
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 401 });
  }

  const { data: membership } = await supabase
    .from("organization_members")
    .select("roles(slug)")
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  const role = membership?.roles as unknown as { slug: string } | null;
  if (role?.slug !== "owner") {
    await supabase.auth.signOut();
    return NextResponse.json({ error: "This reset link is invalid or has expired." }, { status: 401 });
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 400 });
  }

  await supabase.auth.signOut({ scope: "global" });
  return NextResponse.json({ ok: true });
}
