import { NextResponse } from "next/server";
import { createServerSupabase, createServerSupabaseAdmin } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/env";
import {
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_ID_CREDENTIALS_MESSAGE,
  normalizeGymCode,
  normalizeUsername,
} from "@/lib/auth/username";
import { loginSchema, portalLoginSchema, type PortalRole } from "@/lib/validation/auth-schemas";
import { roleMatchesPortal } from "@/lib/auth/portals";

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
    return NextResponse.json({ error: "Supabase is not configured." }, { status: 503 });
  }
  if (!admin) {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }

  const lookup = await lookupEmail(admin, portal, identifier, gymCode);
  if (lookup.error) {
    return NextResponse.json({ error: "Unable to sign in right now." }, { status: 503 });
  }
  if (!lookup.email) {
    return NextResponse.json({ error: failMessage }, { status: 401 });
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email: lookup.email,
    password,
  });

  if (error || !data.user) {
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
