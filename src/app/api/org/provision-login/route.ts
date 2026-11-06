import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { resolveAppContext } from "@/lib/auth/server";
import { hasPermission, PERMISSIONS } from "@/lib/auth/permissions";
import {
  initialPasswordFromPhone,
  isAuthCreateCollision,
  loginUsernamesForRecord,
  normalizeContactNumber,
  toInternalAuthEmail,
  USERNAME_TAKEN_MESSAGE,
} from "@/lib/auth/username";
import { friendlyMessage } from "@/lib/errors";
import { provisionLoginBodySchema } from "@/lib/validation/auth-schemas";

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

  const parsed = provisionLoginBodySchema.safeParse(body);
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
    return NextResponse.json({ error: "Unable to create a login right now." }, { status: 503 });
  }

  const { kind, recordId } = parsed.data;
  const recordResult =
    kind === "trainer"
      ? await supabase
          .from("trainers")
          .select("id, code, first_name, last_name, phone, user_id")
          .eq("id", recordId)
          .maybeSingle()
      : await supabase
          .from("gym_members")
          .select("id, code, first_name, last_name, phone, user_id")
          .eq("id", recordId)
          .maybeSingle();
  const record = recordResult.data;
  const recordError = recordResult.error;

  if (recordError) {
    return NextResponse.json({ error: friendlyMessage(recordError) }, { status: 400 });
  }
  if (!record) {
    return NextResponse.json({ error: "That item could not be found." }, { status: 404 });
  }
  if (record.user_id) {
    return NextResponse.json(
      {
        error:
          kind === "trainer"
            ? "login is already linked to another trainer"
            : "login is already linked to another member",
      },
      { status: 400 },
    );
  }

  const code = typeof record.code === "string" ? record.code.trim() : "";
  if (!code) {
    return NextResponse.json(
      { error: kind === "trainer" ? "Trainer code is required." : "Member code is required." },
      { status: 400 },
    );
  }

  const phone = typeof record.phone === "string" ? record.phone : "";
  const ownerSetPassword = Boolean(parsed.data.password);
  const password = ownerSetPassword
    ? parsed.data.password!
    : initialPasswordFromPhone(phone);
  if (!password) {
    return NextResponse.json(
      {
        error: ownerSetPassword
          ? "Please check your details and try again."
          : "A registered mobile number is required to create a login.",
      },
      { status: 400 },
    );
  }

  const firstName = typeof record.first_name === "string" ? record.first_name : "";
  const lastName = typeof record.last_name === "string" ? record.last_name : "";
  const contactNumber = normalizeContactNumber(phone);
  const usernames = loginUsernamesForRecord(code, recordId, kind);
  if (usernames.length === 0) {
    return NextResponse.json(
      { error: kind === "trainer" ? "Trainer code is required." : "Member code is required." },
      { status: 400 },
    );
  }

  let createdUserId: string | null = null;
  let lastCreateError: string | null = null;
  for (const username of usernames) {
    const availability = await supabase.rpc("username_is_available", { p_username: username });
    if (availability.error) {
      return NextResponse.json({ error: "Unable to create a login right now." }, { status: 503 });
    }
    if (availability.data === false) {
      lastCreateError = USERNAME_TAKEN_MESSAGE;
      continue;
    }

    const created = await admin.auth.admin.createUser({
      email: toInternalAuthEmail(username),
      password,
      email_confirm: true,
      user_metadata: {
        first_name: firstName,
        last_name: lastName,
        username,
        ...(contactNumber ? { contact_number: contactNumber } : {}),
      },
    });
    if (created.data.user) {
      createdUserId = created.data.user.id;
      lastCreateError = null;
      break;
    }
    lastCreateError = created.error?.message ?? "";
    if (!isAuthCreateCollision(lastCreateError)) {
      return NextResponse.json({ error: "Unable to create a login right now." }, { status: 503 });
    }
  }

  if (!createdUserId) {
    if (isAuthCreateCollision(lastCreateError)) {
      return NextResponse.json({ error: USERNAME_TAKEN_MESSAGE }, { status: 409 });
    }
    return NextResponse.json({ error: "Unable to create a login right now." }, { status: 503 });
  }

  const { error: provisionError } = await supabase.rpc("provision_linked_login", {
    p_kind: kind,
    p_record_id: recordId,
    p_user_id: createdUserId,
  });

  if (provisionError) {
    await admin.auth.admin.deleteUser(createdUserId);
    return NextResponse.json({ error: friendlyMessage(provisionError) }, { status: 400 });
  }

  if (ownerSetPassword) {
    await admin.rpc("complete_password_change", { p_user_id: createdUserId });
  }

  return NextResponse.json({ ok: true, loginId: code.toUpperCase() });
}
