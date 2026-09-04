/**
 * Client-side auth service (Phase 3).
 *
 * Thin wrappers around the Supabase browser client so pages and hooks never
 * talk to Supabase directly. Every method returns a typed `AuthResult` and
 * never throws.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppProfile } from "@/lib/auth/types";

export type AuthResult<T = undefined> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code?: string } };

export interface SignUpInput {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
}

export interface SignUpResult {
  userId: string;
  email: string;
  /** Present when email confirmation is not required. */
  sessionCreated: boolean;
}

const DB_INTERNAL_RE = /sql|relation|column|row-level security|\brls\b|violates|database error/i;

/**
 * Maps a raw Supabase / API error into one of the spec's public messages so DB
 * internals are never surfaced to the user. Falls back to the original message
 * only when it is already user-safe.
 */
export function toAuthErrorMessage(error: unknown): string {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : "";
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : "";

  if (
    code === "invalid_credentials" ||
    /invalid login credentials|email or password|password is incorrect/i.test(raw)
  ) {
    return "Email or password is incorrect.";
  }
  if (
    code === "session_missing" ||
    code === "refresh_token_not_found" ||
    /session has expired|session expired|auth session missing|refresh token/i.test(raw)
  ) {
    return "Your session has expired. Please sign in again.";
  }
  if (
    /permission|row-level security|\bpolicy\b|not authorized|insufficient privileges|access denied|access to this area/i.test(raw)
  ) {
    return "You don't have permission to access this area.";
  }
  if (DB_INTERNAL_RE.test(raw)) {
    return "Something went wrong. Please try again.";
  }
  return raw || "Something went wrong. Please try again.";
}

const toResultError = (error: unknown): { message: string; code?: string } => {
  const message = toAuthErrorMessage(error);
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code)
      : undefined;
  return { message, code };
};

export async function signInWithPassword(
  email: string,
  password: string,
): Promise<AuthResult<{ userId: string }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) return { data: null, error: toResultError(error) };
  if (!data.user) {
    return { data: null, error: { message: "No user was returned." } };
  }

  return { data: { userId: data.user.id }, error: null };
}

export async function signUpWithPassword(
  input: SignUpInput,
): Promise<AuthResult<SignUpResult>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const { data, error } = await supabase.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
      },
      emailRedirectTo: `${window.location.origin}/auth/callback?next=/login?verified=email`,
    },
  });

  if (error) return { data: null, error: toResultError(error) };
  if (!data.user) {
    return { data: null, error: { message: "No user was returned." } };
  }

  return {
    data: {
      userId: data.user.id,
      email: data.user.email ?? input.email,
      sessionCreated: Boolean(data.session),
    },
    error: null,
  };
}

export async function signOutCurrentUser(): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.auth.signOut();
  if (error) return { data: null, error: toResultError(error) };
  return { data: undefined, error: null };
}

export async function sendPasswordResetEmail(email: string): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) return { data: null, error: toResultError(error) };
  return { data: undefined, error: null };
}

export async function updateUserPassword(password: string): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { data: null, error: toResultError(error) };
  return { data: undefined, error: null };
}

/**
 * Exchanges a one-time code (from a password-reset / confirmation email link)
 * for a session. Returns null when the code is missing or invalid.
 */
export async function exchangeCodeForSession(code: string): Promise<AuthResult<{ userId: string }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return { data: null, error: toResultError(error) };
  if (!data.user) {
    return { data: null, error: { message: "No user was returned." } };
  }
  return { data: { userId: data.user.id }, error: null };
}

export interface SessionUser {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return null;

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const meta = user.user_metadata as Record<string, unknown> | undefined;
  return {
    id: user.id,
    email: user.email ?? null,
    firstName: typeof meta?.first_name === "string" ? meta.first_name : null,
    lastName: typeof meta?.last_name === "string" ? meta.last_name : null,
  };
}

export function onAuthStateChange(
  callback: (event: "SIGNED_IN" | "SIGNED_OUT" | "INITIAL_SESSION", userId: string | null) => void,
): () => void {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return () => {};

  const { data } = supabase.auth.onAuthStateChange((event, session) => {
    const userId = session?.user.id ?? null;
    if (event === "SIGNED_IN") callback("SIGNED_IN", userId);
    else if (event === "SIGNED_OUT") callback("SIGNED_OUT", null);
    else if (event === "INITIAL_SESSION") callback("INITIAL_SESSION", userId);
  });

  return () => data.subscription.unsubscribe();
}

/** Maps a raw profile row into the AppProfile shape. */
export function toAppProfile(row: {
  id: string;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  avatar_url: string | null;
  preferences: unknown;
}): AppProfile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.phone,
    avatarUrl: row.avatar_url,
    preferences:
      row.preferences && typeof row.preferences === "object"
        ? (row.preferences as Record<string, unknown>)
        : {},
  };
}
