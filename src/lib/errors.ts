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
  "could not be found",
];

const SCHEMA_MISSING_KEYS: readonly string[] = [
  "function ",
  "column ",
  "relation ",
  "type ",
  "operator ",
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
  if (
    text.includes("does not exist") &&
    SCHEMA_MISSING_KEYS.some((key) => text.includes(key))
  ) {
    return { code: "database", message: MESSAGES.database };
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
    text.includes("role slug is required") ||
    text.includes("currency is required") ||
    text.includes("timezone is required") ||
    text.includes("date format is required") ||
    text.includes("you already belong to an organization") ||
    text.includes("organization name is required") ||
    text.includes("branch name is required") ||
    text.includes("branch code is required") ||
    text.includes("branch code may only contain") ||
    text.includes("branch code already exists") ||
    text.includes("cannot deactivate the last active branch") ||
    text.includes("setting key is required") ||
    text.includes("setting key is invalid") ||
    text.includes("first name is required") ||
    text.includes("last name is required") ||
    text.includes("phone is required") ||
    text.includes("phone must contain at least 8 digits") ||
    text.includes("gender is invalid") ||
    text.includes("branch is required") ||
    text.includes("member code already exists") ||
    text.includes("trainer assignment is not available yet") ||
    text.includes("status is required") ||
    text.includes("end date cannot be before start date") ||
    text.includes("amounts cannot be negative") ||
    text.includes("only active memberships can be") ||
    text.includes("extension days must be greater than zero") ||
    text.includes("freeze duration must be greater than zero") ||
    text.includes("freeze exceeds the plan freeze allowance") ||
    text.includes("plan is not active") ||
    text.includes("start and end dates are required") ||
    text.includes("member not found") ||
    text.includes("membership not found") ||
    text.includes("at least one invoice item is required") ||
    text.includes("tax mode is invalid") ||
    text.includes("quantity must be greater than zero") ||
    text.includes("item type is invalid") ||
    text.includes("membership plan is required") ||
    text.includes("member already has an overlapping active membership") ||
    text.includes("invoice not found") ||
    text.includes("invoice is already cancelled") ||
    text.includes("paid invoices cannot be cancelled") ||
    text.includes("only draft invoices can be issued") ||
    text.includes("payments can only be recorded against issued invoices") ||
    text.includes("payment amount must be greater than zero") ||
    text.includes("payment method is invalid") ||
    text.includes("payment exceeds the outstanding balance") ||
    text.includes("at least one payment is required") ||
    text.includes("installments require an issued invoice") ||
    text.includes("this invoice already has an installment schedule") ||
    text.includes("installment count must be between 1 and 24") ||
    text.includes("installments require an outstanding balance") ||
    text.includes("applied credit notes cannot be cancelled") ||
    text.includes("payment not found") ||
    text.includes("refund amount must be greater than zero") ||
    text.includes("refund exceeds the refundable amount") ||
    text.includes("a matching refund was just recorded") ||
    text.includes("refund method is invalid") ||
    text.includes("refund not found") ||
    text.includes("refund status is invalid") ||
    text.includes("completed refunds cannot be changed") ||
    text.includes("credit notes require an issued invoice") ||
    text.includes("at least one credit note item is required") ||
    text.includes("item description is required") ||
    text.includes("credit note amount must be greater than zero") ||
    text.includes("credit note exceeds the remaining invoice amount")
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
