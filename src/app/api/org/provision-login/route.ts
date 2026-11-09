import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import { getSupabaseServiceRoleKey } from "@/lib/server-env";
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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const LOGIN_SERVER_NOT_CONFIGURED = "Login server is not configured.";
const LOGIN_CREATED_NOT_LINKED = "Login was created but not linked. Try again.";

type AdminClient = NonNullable<Awaited<ReturnType<typeof createServerSupabaseAdmin>>>;
type UserClient = NonNullable<Awaited<ReturnType<typeof createServerSupabase>>>;

function newRequestId(): string {
  return crypto.randomUUID();
}

function jsonError(status: number, error: string, requestId: string) {
  return NextResponse.json({ error, requestId }, { status });
}

function logProvision(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "provision-login", ...entry }));
}

function alreadyLinkedMessage(kind: "trainer" | "member"): string {
  return kind === "trainer"
    ? "login is already linked to another trainer"
    : "login is already linked to another member";
}

async function findAuthUserByUsername(
  admin: AdminClient,
  username: string,
): Promise<User | null> {
  const email = toInternalAuthEmail(username);
  const { data: profile } = await admin
    .from("profiles")
    .select("id")
    .eq("username", username)
    .maybeSingle();
  const profileId = typeof profile?.id === "string" ? profile.id : null;
  if (profileId) {
    const { data } = await admin.auth.admin.getUserById(profileId);
    if (data.user) return data.user;
  }
  const { data: byEmail } = await admin
    .from("profiles")
    .select("id")
    .eq("email", email)
    .limit(1);
  const emailId = typeof byEmail?.[0]?.id === "string" ? byEmail[0].id : null;
  if (!emailId || emailId === profileId) return null;
  const { data } = await admin.auth.admin.getUserById(emailId);
  return data.user ?? null;
}

async function identityIsLinkedElsewhere(
  admin: AdminClient,
  orgId: string,
  userId: string,
  kind: "trainer" | "member",
  recordId: string,
): Promise<"self" | "other" | "none"> {
  const trainer = await admin
    .from("trainers")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  const member = await admin
    .from("gym_members")
    .select("id")
    .eq("organization_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();
  const trainerId = typeof trainer.data?.id === "string" ? trainer.data.id : null;
  const memberId = typeof member.data?.id === "string" ? member.data.id : null;
  if (kind === "trainer" && trainerId === recordId) return "self";
  if (kind === "member" && memberId === recordId) return "self";
  if (trainerId || memberId) return "other";
  return "none";
}

async function recoverExistingMembership(
  supabase: UserClient,
  kind: "trainer" | "member",
  recordId: string,
  userId: string,
): Promise<string | null> {
  const linked =
    kind === "trainer"
      ? await supabase.rpc("link_trainer_user", { p_trainer_id: recordId, p_user_id: userId })
      : await supabase.rpc("link_gym_member_user", { p_member_id: recordId, p_user_id: userId });
  return linked.error ? friendlyMessage(linked.error) : null;
}

async function verifyRecordLinked(
  admin: AdminClient,
  kind: "trainer" | "member",
  recordId: string,
  orgId: string,
  userId: string,
): Promise<boolean> {
  const result =
    kind === "trainer"
      ? await admin
          .from("trainers")
          .select("id, user_id")
          .eq("id", recordId)
          .eq("organization_id", orgId)
          .maybeSingle()
      : await admin
          .from("gym_members")
          .select("id, user_id")
          .eq("id", recordId)
          .eq("organization_id", orgId)
          .maybeSingle();
  return result.data?.user_id === userId;
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  if (!isSupabaseConfigured) {
    logProvision({ requestId, stage: "config", status: 503, reason: "supabase_not_configured" });
    return jsonError(503, "Supabase is not configured.", requestId);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError(400, "Please check your details and try again.", requestId);
  }

  const parsed = provisionLoginBodySchema.safeParse(body);
  if (!parsed.success) {
    const message =
      parsed.error.issues.find((issue) => issue.path[0] === "confirmPassword")?.message ||
      parsed.error.issues.find((issue) => issue.path[0] === "password")?.message ||
      "Please check your details and try again.";
    return jsonError(400, message, requestId);
  }

  const resolved = await resolveAppContext();
  if (resolved.status === "unauthenticated" || resolved.status === "not_configured") {
    logProvision({ requestId, stage: "auth", status: 401, reason: resolved.status });
    return jsonError(401, "Please sign in to continue.", requestId);
  }
  if (
    resolved.status !== "ok" ||
    !resolved.context ||
    !hasPermission(resolved.context.permissions, PERMISSIONS.users.manage)
  ) {
    logProvision({ requestId, stage: "authz", status: 403, reason: resolved.status });
    return jsonError(403, "You don't have permission to do that.", requestId);
  }

  const orgId = resolved.context.organization.id;
  const { kind, recordId } = parsed.data;

  const supabase = await createServerSupabase();
  if (!supabase) {
    logProvision({ requestId, stage: "config", status: 503, reason: "user_client_missing" });
    return jsonError(503, LOGIN_SERVER_NOT_CONFIGURED, requestId);
  }
  if (!getSupabaseServiceRoleKey()) {
    logProvision({ requestId, stage: "config", status: 503, reason: "service_role_missing" });
    return jsonError(503, LOGIN_SERVER_NOT_CONFIGURED, requestId);
  }
  const admin = await createServerSupabaseAdmin();
  if (!admin) {
    logProvision({ requestId, stage: "config", status: 503, reason: "admin_client_missing" });
    return jsonError(503, LOGIN_SERVER_NOT_CONFIGURED, requestId);
  }

  const recordResult =
    kind === "trainer"
      ? await supabase
          .from("trainers")
          .select("id, organization_id, code, first_name, last_name, phone, user_id")
          .eq("id", recordId)
          .maybeSingle()
      : await supabase
          .from("gym_members")
          .select("id, organization_id, code, first_name, last_name, phone, user_id")
          .eq("id", recordId)
          .maybeSingle();

  if (recordResult.error) {
    logProvision({
      requestId,
      stage: "lookup",
      status: 400,
      kind,
      reason: "record_query_failed",
    });
    return jsonError(400, friendlyMessage(recordResult.error), requestId);
  }
  if (!recordResult.data || recordResult.data.organization_id !== orgId) {
    logProvision({ requestId, stage: "lookup", status: 404, kind, reason: "record_not_in_org" });
    return jsonError(404, "That item could not be found.", requestId);
  }

  const record = recordResult.data;
  if (record.user_id) {
    return jsonError(400, alreadyLinkedMessage(kind), requestId);
  }

  const code = typeof record.code === "string" ? record.code.trim() : "";
  if (!code) {
    return jsonError(
      400,
      kind === "trainer" ? "Trainer code is required." : "Member code is required.",
      requestId,
    );
  }

  const phone = typeof record.phone === "string" ? record.phone : "";
  const ownerSetPassword = Boolean(parsed.data.password);
  const password = ownerSetPassword ? parsed.data.password! : initialPasswordFromPhone(phone);
  if (!password) {
    return jsonError(
      400,
      ownerSetPassword
        ? "Please check your details and try again."
        : "A registered mobile number is required to create a login.",
      requestId,
    );
  }

  const firstName = typeof record.first_name === "string" ? record.first_name : "";
  const lastName = typeof record.last_name === "string" ? record.last_name : "";
  const contactNumber = normalizeContactNumber(phone);
  const usernames = loginUsernamesForRecord(code, recordId, kind);
  if (usernames.length === 0) {
    return jsonError(
      400,
      kind === "trainer" ? "Trainer code is required." : "Member code is required.",
      requestId,
    );
  }

  let targetUserId: string | null = null;
  let reusedExisting = false;
  let lastCreateError: string | null = null;

  for (const username of usernames) {
    const existing = await findAuthUserByUsername(admin, username);
    if (existing) {
      const linked = await identityIsLinkedElsewhere(admin, orgId, existing.id, kind, recordId);
      if (linked === "self") {
        const { error: passwordError } = await admin.auth.admin.updateUserById(existing.id, {
          password,
        });
        if (passwordError) {
          logProvision({ requestId, stage: "reuse", status: 400, kind, reason: "password_update_failed" });
          return jsonError(400, "Unable to set the login password. Try again.", requestId);
        }
        if (ownerSetPassword) {
          await admin.rpc("complete_password_change", { p_user_id: existing.id });
        }
        const verified = await verifyRecordLinked(admin, kind, recordId, orgId, existing.id);
        if (!verified) {
          logProvision({ requestId, stage: "verify", status: 503, kind, reason: "link_not_persisted" });
          return jsonError(503, LOGIN_CREATED_NOT_LINKED, requestId);
        }
        logProvision({ requestId, stage: "done", status: 200, kind, reused: true, alreadyLinked: true });
        return NextResponse.json({ ok: true, loginId: code.toUpperCase(), requestId });
      }
      if (linked === "other") {
        lastCreateError = USERNAME_TAKEN_MESSAGE;
        continue;
      }
      const { error: passwordError } = await admin.auth.admin.updateUserById(existing.id, {
        password,
      });
      if (passwordError) {
        logProvision({ requestId, stage: "reuse", status: 400, kind, reason: "password_update_failed" });
        return jsonError(400, "Unable to set the login password. Try again.", requestId);
      }
      targetUserId = existing.id;
      reusedExisting = true;
      lastCreateError = null;
      break;
    }

    const availability = await supabase.rpc("username_is_available", { p_username: username });
    if (availability.error) {
      logProvision({ requestId, stage: "username", status: 503, kind, reason: "availability_rpc_failed" });
      return jsonError(503, "Login setup is not installed on this gym yet.", requestId);
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
      targetUserId = created.data.user.id;
      lastCreateError = null;
      break;
    }
    lastCreateError = created.error?.message ?? "";
    logProvision({
      requestId,
      stage: "createUser",
      kind,
      collision: isAuthCreateCollision(lastCreateError),
      reason: isAuthCreateCollision(lastCreateError) ? "auth_collision" : "create_failed",
    });
    if (!isAuthCreateCollision(lastCreateError)) {
      return jsonError(503, "Unable to create the trainer login. Try again.", requestId);
    }

    const collided = await findAuthUserByUsername(admin, username);
    if (!collided) continue;
    const linked = await identityIsLinkedElsewhere(admin, orgId, collided.id, kind, recordId);
    if (linked === "other") continue;
    const { error: passwordError } = await admin.auth.admin.updateUserById(collided.id, {
      password,
    });
    if (passwordError) {
      logProvision({ requestId, stage: "reuse", status: 400, kind, reason: "password_update_failed" });
      return jsonError(400, "Unable to set the login password. Try again.", requestId);
    }
    targetUserId = collided.id;
    reusedExisting = true;
    lastCreateError = null;
    break;
  }

  if (!targetUserId) {
    logProvision({
      requestId,
      stage: "createUser",
      status: 409,
      kind,
      reason: "all_usernames_taken",
    });
    if (isAuthCreateCollision(lastCreateError) || lastCreateError === USERNAME_TAKEN_MESSAGE) {
      return jsonError(409, USERNAME_TAKEN_MESSAGE, requestId);
    }
    return jsonError(503, "Unable to create the trainer login. Try again.", requestId);
  }

  const { error: provisionError } = await supabase.rpc("provision_linked_login", {
    p_kind: kind,
    p_record_id: recordId,
    p_user_id: targetUserId,
  });

  if (provisionError) {
    const message = friendlyMessage(provisionError);
    const text = provisionError.message.toLowerCase();
    logProvision({
      requestId,
      stage: "provision_rpc",
      kind,
      reused: reusedExisting,
      reason: text.includes("does not exist") ? "rpc_missing" : "rpc_failed",
    });

    if (text.includes("already part of this organization") || text.includes("already a member")) {
      const recovered = await recoverExistingMembership(supabase, kind, recordId, targetUserId);
      if (!recovered) {
        if (ownerSetPassword) {
          await admin.rpc("complete_password_change", { p_user_id: targetUserId });
        }
        const linked = await verifyRecordLinked(admin, kind, recordId, orgId, targetUserId);
        if (!linked) {
          logProvision({ requestId, stage: "verify", status: 503, kind, reason: "link_not_persisted" });
          return jsonError(503, LOGIN_CREATED_NOT_LINKED, requestId);
        }
        logProvision({ requestId, stage: "done", status: 200, kind, reused: true, recovered: true });
        return NextResponse.json({ ok: true, loginId: code.toUpperCase(), requestId });
      }
      return jsonError(400, recovered, requestId);
    }

    if (text.includes("does not exist") && text.includes("provision_linked_login")) {
      return jsonError(503, "Login setup is not installed on this gym yet.", requestId);
    }
    if (text.includes("role not found")) {
      return jsonError(400, "Trainer login role is missing for this gym.", requestId);
    }
    return jsonError(400, message, requestId);
  }

  const linked = await verifyRecordLinked(admin, kind, recordId, orgId, targetUserId);
  if (!linked) {
    logProvision({ requestId, stage: "verify", status: 503, kind, reason: "link_not_persisted" });
    return jsonError(503, LOGIN_CREATED_NOT_LINKED, requestId);
  }

  if (ownerSetPassword) {
    const { error: flagError } = await admin.rpc("complete_password_change", {
      p_user_id: targetUserId,
    });
    if (flagError) {
      logProvision({ requestId, stage: "password_flag", kind, reason: "complete_password_change_failed" });
    }
  }

  logProvision({ requestId, stage: "done", status: 200, kind, reused: reusedExisting });
  return NextResponse.json({ ok: true, loginId: code.toUpperCase(), requestId });
}
