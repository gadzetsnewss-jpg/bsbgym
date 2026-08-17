/**
 * Friendly error mapping (Phase 3).
 *
 * RPCs return plain PostgreSQL error strings via the `message` field. This
 * module maps those strings (and known client-side failures) to a friendly,
 * user-safe message before they reach UI toasts / pages. Raw database errors
 * are never surfaced to the user.
 */

export type FriendlyErrorCode =
  | "unauthorized"
  | "forbidden"
  | "not_found"
  | "session_expired"
  | "invalid_invitation"
  | "duplicate_user"
  | "validation"
  | "database"
  | "network";

export interface FriendlyError {
  code: FriendlyErrorCode;
  message: string;
}

/** Canonical user-facing message per error category. */
const MESSAGES: Record<FriendlyErrorCode, string> = {
  unauthorized: "Please sign in to continue.",
  forbidden: "You don't have permission to do that.",
  not_found: "That item could not be found.",
  session_expired: "Your session has expired. Please sign in again.",
  invalid_invitation: "This invitation is invalid or has expired.",
  duplicate_user: "This user is already part of your organization.",
  validation: "Please check your details and try again.",
  database: "Something went wrong on our end. Please try again.",
  network: "You appear to be offline. Check your connection and try again.",
};

const NOT_FOUND_KEYS: readonly string[] = [
  "not found",
  "no such",
  "does not exist",
  "could not be found",
];

const FORBIDDEN_KEYS: readonly string[] = [
  "insufficient privileges",
  "permission denied",
  "you cannot grant permissions you do not hold",
  "only the owner can",
  "system roles cannot be deactivated",
  "reassign members before deactivating this role",
  "the owner role cannot be invited",
];

const INVALID_INVITATION_KEYS: readonly string[] = [
  "invitation is invalid",
  "invitation has expired",
  "this invitation is no longer valid",
  "invitation not found",
];

const DUPLICATE_KEYS: readonly string[] = [
  "an active invitation already exists",
  "already a member",
  "already part of this organization",
  "already in this organization",
  "duplicate user",
  "user already exists",
];

const SESSION_KEYS: readonly string[] = [
  "not authenticated",
  "auth session missing",
  "token expired",
  "jwt expired",
  "session expired",
];

/**
 * Map a raw error (Supabase error, RPC raise string, or thrown value) to a
 * friendly, typed error. Unknown/unexpected errors fall back to `database`.
 */
export function toFriendlyError(error: unknown): FriendlyError {
  const raw =
    typeof error === "object" && error !== null && "message" in error
      ? String((error as { message: unknown }).message)
      : typeof error === "string"
        ? error
        : "";

  const text = raw.toLowerCase();

  if (SESSION_KEYS.some((key) => text.includes(key))) {
    return { code: "session_expired", message: MESSAGES.session_expired };
  }
  if (FORBIDDEN_KEYS.some((key) => text.includes(key))) {
    return { code: "forbidden", message: MESSAGES.forbidden };
  }
  if (INVALID_INVITATION_KEYS.some((key) => text.includes(key))) {
    return { code: "invalid_invitation", message: MESSAGES.invalid_invitation };
  }
  if (DUPLICATE_KEYS.some((key) => text.includes(key))) {
    return { code: "duplicate_user", message: MESSAGES.duplicate_user };
  }
  if (NOT_FOUND_KEYS.some((key) => text.includes(key))) {
    return { code: "not_found", message: MESSAGES.not_found };
  }
  if (
    typeof navigator !== "undefined" &&
    typeof navigator.onLine === "boolean" &&
    !navigator.onLine
  ) {
    return { code: "network", message: MESSAGES.network };
  }

  // Preserve useful validation messages from RPCs while keeping them safe.
  if (
    text.includes("a valid email is required") ||
    text.includes("a role is required") ||
    text.includes("role name is required") ||
    text.includes("role slug is required")
  ) {
    return { code: "validation", message: raw };
  }

  if (text.includes("supabase is not configured")) {
    return { code: "validation", message: raw };
  }

  return { code: "database", message: MESSAGES.database };
}

/** Convenience wrapper returning only the safe user-facing message. */
export function friendlyMessage(error: unknown): string {
  return toFriendlyError(error).message;
}
