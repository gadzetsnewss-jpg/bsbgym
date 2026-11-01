import { describe, expect, it } from "vitest";
import {
  consumeOwnerRecoveryRateLimit,
  isVerifiedRecoveryEmail,
  maskRecoveryEmail,
  OWNER_RECOVERY_GENERIC_MESSAGE,
  OWNER_SUPPORT_RECOVERY_PROCEDURE,
  ownerEnrollmentRedirectTo,
  ownerRecoveryRedirectTo,
  ownerSignupConfirmRedirectTo,
} from "@/lib/auth/recovery";
import { INTERNAL_AUTH_EMAIL_DOMAIN } from "@/lib/auth/username";

describe("isVerifiedRecoveryEmail", () => {
  it("accepts a confirmed real mailbox", () => {
    expect(isVerifiedRecoveryEmail("owner@gym.example", "2026-01-01T00:00:00Z")).toBe(true);
  });

  it("rejects synthetic, missing, or unverified addresses", () => {
    expect(isVerifiedRecoveryEmail(`owner@${INTERNAL_AUTH_EMAIL_DOMAIN}`, "2026-01-01T00:00:00Z")).toBe(
      false,
    );
    expect(isVerifiedRecoveryEmail("owner@gym.example", null)).toBe(false);
    expect(isVerifiedRecoveryEmail(null, "2026-01-01T00:00:00Z")).toBe(false);
    expect(isVerifiedRecoveryEmail("owner@users.local", "2026-01-01T00:00:00Z")).toBe(false);
  });
});

describe("owner recovery rate limit", () => {
  it("allows a burst then blocks the same key", () => {
    const key = `test-${Math.random()}`;
    const start = 1_700_000_000_000;
    for (let i = 0; i < 5; i += 1) {
      expect(consumeOwnerRecoveryRateLimit(key, start + i)).toBe(true);
    }
    expect(consumeOwnerRecoveryRateLimit(key, start + 6)).toBe(false);
  });
});

describe("owner recovery redirect", () => {
  it("routes through the auth callback onto the owner reset page", () => {
    expect(ownerRecoveryRedirectTo("https://app.example")).toBe(
      "https://app.example/auth/callback?next=%2Fowner%2Freset-password",
    );
    expect(ownerEnrollmentRedirectTo("https://app.example")).toBe(
      "https://app.example/auth/callback?next=%2Fsettings%2Fprofile",
    );
    expect(ownerSignupConfirmRedirectTo("https://app.example")).toBe(
      "https://app.example/auth/callback?next=%2Fonboarding",
    );
    expect(OWNER_RECOVERY_GENERIC_MESSAGE.toLowerCase()).not.toContain("user id");
    expect(OWNER_RECOVERY_GENERIC_MESSAGE.toLowerCase()).not.toContain("organization");
  });
});

describe("recovery email masking and support procedure", () => {
  it("masks local-part and documents support-only lockout", () => {
    expect(maskRecoveryEmail("owner@gym.example")).toBe("o***@gym.example");
    expect(OWNER_SUPPORT_RECOVERY_PROCEDURE).toMatch(/RECOVERY NOT ENROLLED/);
    expect(OWNER_SUPPORT_RECOVERY_PROCEDURE.toLowerCase()).not.toContain("reset based only on username");
  });
});
