export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 32;
export const INTERNAL_AUTH_EMAIL_DOMAIN = "users.bsbfitforge.local";

const USERNAME_RE = /^[a-z0-9]([a-z0-9._-]*[a-z0-9])?$/;

const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "owner",
  "root",
  "support",
  "system",
  "help",
  "api",
  "auth",
  "login",
  "signup",
  "null",
  "undefined",
]);

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase();
}

export function isReservedUsername(value: string): boolean {
  return RESERVED_USERNAMES.has(normalizeUsername(value));
}

export function isValidUsername(value: string): boolean {
  const username = normalizeUsername(value);
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return false;
  }
  if (!USERNAME_RE.test(username)) return false;
  if (isReservedUsername(username)) return false;
  return true;
}

export function usernameValidationMessage(value: string): string | null {
  const username = normalizeUsername(value);
  if (!username) return "Username is required";
  if (username.length < USERNAME_MIN_LENGTH || username.length > USERNAME_MAX_LENGTH) {
    return `Username must be ${USERNAME_MIN_LENGTH}–${USERNAME_MAX_LENGTH} characters`;
  }
  if (!USERNAME_RE.test(username)) {
    return "Use letters, numbers, dots, underscores or hyphens";
  }
  if (isReservedUsername(username)) return "This username is not available";
  return null;
}

export function normalizeContactNumber(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  let national = digits;
  if (digits.startsWith("91") && digits.length === 12) {
    national = digits.slice(2);
  }
  if (national.length !== 10) return null;
  if (!/^[6-9]\d{9}$/.test(national)) return null;
  return `+91${national}`;
}

export function toInternalAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@${INTERNAL_AUTH_EMAIL_DOMAIN}`;
}

export const GENERIC_CREDENTIALS_MESSAGE = "Username or password is incorrect.";
export const USERNAME_TAKEN_MESSAGE = "This username is already taken.";
