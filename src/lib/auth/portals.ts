import type { PortalRole } from "@/lib/validation/auth-schemas";
import {
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_ID_CREDENTIALS_MESSAGE,
  normalizeMemberCode,
  normalizeTrainerCode,
  normalizeUsername,
} from "@/lib/auth/username";

export const PORTAL_HOME: Record<PortalRole, string> = {
  owner: "/dashboard",
  trainer: "/dashboard",
  member: "/dashboard",
};

export const PORTAL_LOGIN_PATH: Record<PortalRole, string> = {
  owner: "/owner/login",
  trainer: "/trainer/login",
  member: "/member/login",
};

export const PORTAL_ALLOWED_SLUGS: Record<PortalRole, readonly string[]> = {
  owner: ["owner", "admin", "manager", "staff"],
  trainer: ["trainer"],
  member: ["member"],
};

export function credentialsMessageForPortal(portal: PortalRole | null): string {
  return portal ? GENERIC_ID_CREDENTIALS_MESSAGE : GENERIC_CREDENTIALS_MESSAGE;
}

export function normalizePortalId(portal: PortalRole, value: string): string {
  if (portal === "member") return normalizeMemberCode(value);
  if (portal === "trainer") return normalizeTrainerCode(value);
  return normalizeUsername(value);
}

export function roleMatchesPortal(roleSlug: string | null | undefined, portal: PortalRole): boolean {
  return PORTAL_ALLOWED_SLUGS[portal].includes(roleSlug ?? "");
}
