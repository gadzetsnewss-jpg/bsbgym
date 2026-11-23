import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  EMAIL_NOT_CONFIRMED_MESSAGE,
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_ID_CREDENTIALS_MESSAGE,
  initialPasswordFromPhone,
  loginUsernamesForRecord,
  normalizeContactNumber,
  normalizeGymCode,
  normalizeUsername,
  toInternalAuthEmail,
} from "@/lib/auth/username";
import { loginSchema, portalLoginSchema, type PortalRole } from "@/lib/validation/auth-schemas";
import { roleMatchesPortal } from "@/lib/auth/portals";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Lookup = { email: string | null; error: boolean };

async function lookupByUsername(
  admin: NonNullable<Awaited<ReturnType<typeof createServerSupabaseAdmin>>>,
  identifier: string,
): Promise<Lookup> {
  const { data, error } = await admin.rpc("auth_email_for_username", {
    p_username: normalizeUsername(identifier),
  });
  return { email: data ?? null, error: Boolean(error) };
}

async function lookupEmail(
  admin: NonNullable<Awaited<ReturnType<typeof createServerSupabaseAdmin>>>,
  portal: PortalRole | null,
  identifier: string,
  gymCode: string | null,
): Promise<Lookup> {
  if (portal === "member" || portal === "trainer") {
    if (!gymCode) return { email: null, error: false };
    const byCode =
      portal === "member"
        ? await admin.rpc("auth_email_for_member_code", {
            p_gym_code: gymCode,
            p_code: identifier,
          })
        : await admin.rpc("auth_email_for_trainer_code", {
            p_gym_code: gymCode,
            p_code: identifier,
          });
    if (byCode.error) return { email: null, error: true };
    return { email: byCode.data ?? null, error: false };
  }
  return lookupByUsername(admin, identifier);
}

async function membershipForUser(
  admin: NonNullable<Awaited<ReturnType<typeof createServerSupabaseAdmin>>>,
  uid: string,
): Promise<{ roleSlug: string | null; orgSlug: string | null }> {
  const { data, error } = await admin
    .from("organization_members")
    .select("roles(slug), organizations(slug)")
    .eq("user_id", uid)
    .eq("status", "active")
    .maybeSingle();
  if (error || !data) return { roleSlug: null, orgSlug: null };
  const role = data.roles as unknown as { slug: string } | null;
  const org = data.organizations as unknown as { slug: string } | null;
  return { roleSlug: role?.slug ?? null, orgSlug: org?.slug ?? null };
}

function newRequestId(): string {
  return crypto.randomUUID();
}

function logSignIn(entry: Record<string, unknown>) {
  console.info(JSON.stringify({ scope: "sign-in", ...entry }));
}

export async function POST(request: Request) {
  const requestId = newRequestId();

  if (!isSupabaseConfigured) {
    logSignIn({ requestId, stage: "config", status: 503, reason: "supabase_not_configured" });
    return NextResponse.json({ error: "Supabase is not configured.", requestId }, { status: 503 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: GENERIC_CREDENTIALS_MESSAGE }, { status: 400 });
  }

  const portalParsed = portalLoginSchema.safeParse(body);
  const legacyParsed = loginSchema.safeParse(body);
  const portal: PortalRole | null = portalParsed.success ? portalParsed.data.portal : null;
  const identifier = portalParsed.success
    ? portalParsed.data.id
    : legacyParsed.success
      ? legacyParsed.data.username
      : null;
  const password = portalParsed.success
    ? portalParsed.data.password
    : legacyParsed.success
      ? legacyParsed.data.password
      : null;
  const gymCode =
    portalParsed.success && (portal === "trainer" || portal === "member")
      ? normalizeGymCode(portalParsed.data.gymCode ?? "")
      : null;
  const failMessage = portal ? GENERIC_ID_CREDENTIALS_MESSAGE : GENERIC_CREDENTIALS_MESSAGE;

  if (!identifier || !password) {
    return NextResponse.json({ error: failMessage }, { status: 400 });
  }
  if ((portal === "trainer" || portal === "member") && !gymCode) {
    return NextResponse.json({ error: failMessage }, { status: 400 });
  }

  const admin = await createServerSupabaseAdmin();
  const supabase = await createServerSupabase();
  if (!supabase) {
    logSignIn({ requestId, stage: "config", status: 503, reason: "user_client_missing" });
    return NextResponse.json({ error: "Supabase is not configured.", requestId }, { status: 503 });
  }
  if (!admin) {
    logSignIn({ requestId, stage: "config", status: 503, reason: "admin_client_missing" });
    return NextResponse.json({ error: "Unable to sign in right now.", requestId }, { status: 503 });
  }

  let lookup = await lookupEmail(admin, portal, identifier, gymCode);
  if (lookup.error) {
    logSignIn({ requestId, stage: "lookup", status: 503, portal, reason: "lookup_rpc_failed" });
    return NextResponse.json({ error: "Unable to sign in right now.", requestId }, { status: 503 });
  }

  // If member code has no provisioned user yet, verify registered phone number and auto-provision
  if (!lookup.email && portal === "member" && gymCode) {
    try {
      const { data: orgData } = await admin
        .from("organizations")
        .select("id")
        .eq("slug", gymCode)
        .in("status", ["active", "trial"])
        .maybeSingle();

      if (orgData?.id) {
        const { data: memberRecord } = await admin
          .from("gym_members")
          .select("id, organization_id, code, first_name, last_name, phone, user_id")
          .eq("organization_id", orgData.id)
          .ilike("code", identifier)
          .maybeSingle();

        if (memberRecord && typeof memberRecord.phone === "string") {
          const enteredPhone = initialPasswordFromPhone(password);
          const memberPhone = initialPasswordFromPhone(memberRecord.phone);
          if (enteredPhone && memberPhone && enteredPhone === memberPhone) {
            const usernames = loginUsernamesForRecord(memberRecord.code, memberRecord.id, "member");
            const targetUsername =
              usernames[0] || `mem-${memberRecord.code.toLowerCase().replace(/[^a-z0-9]/g, "")}`;
            const targetEmail = toInternalAuthEmail(targetUsername);

            const { data: createdUser, error: createError } = await admin.auth.admin.createUser({
              email: targetEmail,
              password: enteredPhone,
              email_confirm: true,
              user_metadata: {
                first_name: memberRecord.first_name,
                last_name: memberRecord.last_name,
                contact_number: normalizeContactNumber(memberRecord.phone),
                username: targetUsername,
              },
            });

            if (!createError && createdUser?.user) {
              await admin.rpc("provision_linked_login", {
                p_kind: "member",
                p_record_id: memberRecord.id,
                p_user_id: createdUser.user.id,
              });
              lookup = { email: targetEmail, error: false };
            }
          }
        }
      }
    } catch {
      // Fall through to generic error
    }
  }

  if (!lookup.email) {
    return NextResponse.json({ error: failMessage }, { status: 401 });
  }

  let { data, error } = await supabase.auth.signInWithPassword({
    email: lookup.email,
    password,
  });

  // If initial password attempt fails for member, retry with normalized digits in case phone was formatted
  if (error && portal === "member") {
    const normalizedDigits = initialPasswordFromPhone(password);
    if (normalizedDigits && normalizedDigits !== password) {
      const retry = await supabase.auth.signInWithPassword({
        email: lookup.email,
        password: normalizedDigits,
      });
      if (!retry.error && retry.data?.user) {
        data = retry.data;
        error = null;
      }
    }
  }

  if (error || !data.user) {
    if (error && /email not confirmed/i.test(error.message)) {
      return NextResponse.json({ error: EMAIL_NOT_CONFIRMED_MESSAGE }, { status: 401 });
    }
    return NextResponse.json({ error: failMessage }, { status: 401 });
  }

  if (portal) {
    const membership = await membershipForUser(admin, data.user.id);
    if (!roleMatchesPortal(membership.roleSlug, portal)) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: failMessage }, { status: 401 });
    }
    if (
      (portal === "trainer" || portal === "member") &&
      gymCode &&
      normalizeGymCode(membership.orgSlug ?? "") !== gymCode
    ) {
      await supabase.auth.signOut();
      return NextResponse.json({ error: failMessage }, { status: 401 });
    }
  }

  return NextResponse.json({ ok: true });
}
