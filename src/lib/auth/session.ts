/**
 * Client-side auth service (Phase 3).
 *
 * Thin wrappers around the Supabase browser client so pages and hooks never
 * talk to Supabase directly. Every method returns a typed `AuthResult` and
 * never throws.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AppProfile } from "@/lib/auth/types";
import {
  GENERIC_CREDENTIALS_MESSAGE,
  USERNAME_TAKEN_MESSAGE,
  normalizeContactNumber,
  normalizeUsername,
  toInternalAuthEmail,
} from "@/lib/auth/username";

export type AuthResult<T = undefined> =
  | { data: T; error: null }
  | { data: null; error: { message: string; code?: string } };

export interface SignUpInput {
  firstName: string;
  lastName: string;
  username: string;
  contactNumber: string;
  password: string;
}

export interface SignUpResult {
  userId: string;
  username: string;
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
    /invalid login credentials|email or password|username or password|password is incorrect/i.test(raw)
  ) {
    return GENERIC_CREDENTIALS_MESSAGE;
  }
  if (/username is already taken|duplicate key.*username|already registered/i.test(raw)) {
    return USERNAME_TAKEN_MESSAGE;
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
  username: string,
  password: string,
): Promise<AuthResult<{ userId: string }>> {
  if (!getSupabaseBrowserClient()) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  try {
    const response = await fetch("/api/auth/sign-in", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    });
    const payload = (await response.json()) as { userId?: string; error?: string };
    if (!response.ok || !payload.userId) {
      return {
        data: null,
        error: { message: payload.error || GENERIC_CREDENTIALS_MESSAGE },
      };
    }
    return { data: { userId: payload.userId }, error: null };
  } catch {
    return { data: null, error: { message: "Something went wrong. Please try again." } };
  }
}

export async function signUpWithPassword(
  input: SignUpInput,
): Promise<AuthResult<SignUpResult>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  const username = normalizeUsername(input.username);
  const contactNumber = normalizeContactNumber(input.contactNumber);
  if (!contactNumber) {
    return { data: null, error: { message: "Enter a valid 10-digit Indian mobile number." } };
  }

  const { data: available, error: availabilityError } = await supabase.rpc(
    "username_is_available",
    { p_username: username },
  );
  if (availabilityError) return { data: null, error: toResultError(availabilityError) };
  if (available === false) {
    return { data: null, error: { message: USERNAME_TAKEN_MESSAGE } };
  }

  const { data, error } = await supabase.auth.signUp({
    email: toInternalAuthEmail(username),
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        username,
        contact_number: contactNumber,
      },
    },
  });

  if (error) return { data: null, error: toResultError(error) };
  if (!data.user) {
    return { data: null, error: { message: "No user was returned." } };
  }

  return {
    data: {
      userId: data.user.id,
      username,
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

export async function sendPasswordResetEmail(username: string): Promise<AuthResult> {
  if (!getSupabaseBrowserClient()) {
    return { data: null, error: { message: "Supabase is not configured." } };
  }

  try {
    const response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username }),
    });
    if (!response.ok) {
      return { data: undefined, error: null };
    }
    return { data: undefined, error: null };
  } catch {
    return { data: undefined, error: null };
  }
}

export async function updateUserPassword(password: string): Promise<AuthResult> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { data: null, error: toResultError(error) };
  return { data: undefined, error: null };
}

/**
 * Exchanges a one-time code (from a password-reset email link)
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
  username: string | null;
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
    username: typeof meta?.username === "string" ? meta.username : null,
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
  username?: string | null;
  contact_number?: string | null;
  avatar_url: string | null;
  preferences: unknown;
}): AppProfile {
  return {
    id: row.id,
    firstName: row.first_name,
    lastName: row.last_name,
    email: row.email,
    phone: row.contact_number ?? row.phone,
    username: row.username ?? null,
    contactNumber: row.contact_number ?? null,
    avatarUrl: row.avatar_url,
    preferences:
      row.preferences && typeof row.preferences === "object"
        ? (row.preferences as Record<string, unknown>)
        : {},
  };
}
