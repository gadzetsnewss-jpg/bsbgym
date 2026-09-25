import { describe, expect, it } from "vitest";
import {
  GENERIC_CREDENTIALS_MESSAGE,
  INTERNAL_AUTH_EMAIL_DOMAIN,
  USERNAME_TAKEN_MESSAGE,
  isValidUsername,
  normalizeContactNumber,
  normalizeUsername,
  toInternalAuthEmail,
  usernameValidationMessage,
} from "@/lib/auth/username";

describe("normalizeUsername", () => {
  it("trims and lowercases", () => {
    expect(normalizeUsername("  Asha.Mehta ")).toBe("asha.mehta");
  });
});

describe("isValidUsername", () => {
  it("accepts valid usernames", () => {
    expect(isValidUsername("asha")).toBe(true);
    expect(isValidUsername("trainer_01")).toBe(true);
    expect(isValidUsername("gym-owner")).toBe(true);
    expect(isValidUsername("a.b")).toBe(true);
  });

  it("rejects invalid usernames", () => {
    expect(isValidUsername("ab")).toBe(false);
    expect(isValidUsername("bad name")).toBe(false);
    expect(isValidUsername("-leading")).toBe(false);
    expect(isValidUsername("trailing.")).toBe(false);
    expect(isValidUsername("admin")).toBe(false);
  });
});

describe("usernameValidationMessage", () => {
  it("returns a required message for blanks", () => {
    expect(usernameValidationMessage("  ")).toBe("Username is required");
  });
});

describe("normalizeContactNumber", () => {
  it("normalizes 10-digit Indian mobiles to E.164", () => {
    expect(normalizeContactNumber("98765 43210")).toBe("+919876543210");
    expect(normalizeContactNumber("+91 9876543210")).toBe("+919876543210");
    expect(normalizeContactNumber("919876543210")).toBe("+919876543210");
  });

  it("rejects invalid numbers", () => {
    expect(normalizeContactNumber("12345")).toBeNull();
    expect(normalizeContactNumber("0123456789")).toBeNull();
    expect(normalizeContactNumber("5876543210")).toBeNull();
  });
});

describe("toInternalAuthEmail", () => {
  it("maps a username to the internal auth email", () => {
    expect(toInternalAuthEmail("Asha.Mehta")).toBe(`asha.mehta@${INTERNAL_AUTH_EMAIL_DOMAIN}`);
  });
});

describe("public auth messages", () => {
  it("never includes email in credential failures", () => {
    expect(GENERIC_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("email");
    expect(USERNAME_TAKEN_MESSAGE).toBe("This username is already taken.");
  });
});
