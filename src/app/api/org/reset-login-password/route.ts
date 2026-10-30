import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveAppContext } from "@/lib/auth/server";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import { friendlyMessage } from "@/lib/errors";
import { resetLinkedLoginPasswordSchema } from "@/lib/validation/auth-schemas";

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

  const parsed = resetLinkedLoginPasswordSchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues.find((issue) => issue.path[0] === "confirmPassword")?.message ||
      parsed.error.issues.find((issue) => issue.path[0] === "password")?.message ||
      "Please check your details and try again.";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const resolved = await resolveAppContext();
  if (resolved.status === "unauthenticated" || resolved.status === "not_configured") {
    return NextResponse.json({ error: "Please sign in to continue." }, { status: 401 });
  }
  if (
    resolved.status !== "ok" ||
    !resolved.context ||
    !hasPermission(resolved.context.permissions, PERMISSIONS.users.manage)
  ) {
    return NextResponse.json({ error: "You don't have permission to do that." }, { status: 403 });
  }

  const supabase = await createServerSupabase();
  const admin = await createServerSupabaseAdmin();
  if (!supabase || !admin) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 503 });
  }

  const { kind, recordId, password } = parsed.data;
  const recordResult =
    kind === "trainer"
      ? await supabase
          .from("trainers")
          .select("id, user_id")
          .eq("id", recordId)
          .maybeSingle()
      : await supabase
          .from("gym_members")
          .select("id, user_id")
          .eq("id", recordId)
          .maybeSingle();

  if (recordResult.error) {
    return NextResponse.json({ error: friendlyMessage(recordResult.error) }, { status: 400 });
  }
  if (!recordResult.data) {
    return NextResponse.json({ error: "That item could not be found." }, { status: 404 });
  }

  const linkedUserId =
    typeof recordResult.data.user_id === "string" ? recordResult.data.user_id : null;
  if (!linkedUserId) {
    return NextResponse.json(
      {
        error:
          kind === "trainer"
            ? "Create a trainer login before resetting the password."
            : "Create a member login before resetting the password.",
      },
      { status: 400 },
    );
  }

  const { error: updateError } = await admin.auth.admin.updateUserById(linkedUserId, {
    password,
  });
  if (updateError) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 400 });
  }

  const { error: flagError } = await admin.rpc("complete_password_change", {
    p_user_id: linkedUserId,
  });
  if (flagError) {
    return NextResponse.json({ error: "Unable to update password right now." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
