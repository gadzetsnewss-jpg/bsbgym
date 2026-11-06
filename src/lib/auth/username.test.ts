import { describe, expect, it } from "vitest";
import {
  GENERIC_CREDENTIALS_MESSAGE,
  GENERIC_ID_CREDENTIALS_MESSAGE,
  INTERNAL_AUTH_EMAIL_DOMAIN,
  USERNAME_MAX_LENGTH,
  USERNAME_TAKEN_MESSAGE,
  initialPasswordFromPhone,
  isValidUsername,
  loginUsernameFromCode,
  memberCodeToUsername,
  normalizeContactNumber,
  normalizeMemberCode,
  normalizeTrainerCode,
  normalizeUsername,
  toInternalAuthEmail,
  trainerCodeToUsername,
  usernameValidationMessage,
  isAuthCreateCollision,
  isInternalAuthEmail,
  isUsableRecoveryEmail,
  loginUsernamesForRecord,
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

  it("detects synthetic auth emails", () => {
    expect(isInternalAuthEmail(`owner.one@${INTERNAL_AUTH_EMAIL_DOMAIN}`)).toBe(true);
    expect(isInternalAuthEmail("owner@gym.example")).toBe(false);
    expect(isInternalAuthEmail(null)).toBe(true);
  });

  it("accepts only deliverable recovery mailboxes", () => {
    expect(isUsableRecoveryEmail("owner@gym.example")).toBe(true);
    expect(isUsableRecoveryEmail(`owner@${INTERNAL_AUTH_EMAIL_DOMAIN}`)).toBe(false);
    expect(isUsableRecoveryEmail("owner@users.local")).toBe(false);
    expect(isUsableRecoveryEmail(null)).toBe(false);
  });
});

describe("public auth messages", () => {
  it("never includes email in credential failures", () => {
    expect(GENERIC_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("email");
    expect(GENERIC_ID_CREDENTIALS_MESSAGE.toLowerCase()).not.toContain("email");
    expect(USERNAME_TAKEN_MESSAGE).toBe("This username is already taken.");
  });
});

describe("portal identifiers", () => {
  it("normalizes member and trainer codes", () => {
    expect(normalizeMemberCode(" mem-0001 ")).toBe("MEM-0001");
    expect(normalizeTrainerCode(" tr-12 ")).toBe("TR-12");
  });

  it("maps codes to valid usernames", () => {
    expect(memberCodeToUsername("MEM-0001")).toBe("mem-0001");
    expect(isValidUsername(memberCodeToUsername("MEM-0001"))).toBe(true);
    expect(trainerCodeToUsername("TR-0001")).toBe("tr-0001");
    expect(isValidUsername(loginUsernameFromCode("AB"))).toBe(true);
    expect(trainerCodeToUsername("DP001")).toBe("dp001");
  });

  it("offers extra login usernames when the trainer code is already taken", () => {
    const recordId = "11111111-2222-3333-4444-555555555555";
    const names = loginUsernamesForRecord("DP001", recordId, "trainer");
    expect(names[0]).toBe("dp001");
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(new Set(names).size).toBe(names.length);
    for (const name of names) {
      expect(isValidUsername(name)).toBe(true);
      expect(name.length).toBeLessThanOrEqual(USERNAME_MAX_LENGTH);
    }
  });

  it("treats GoTrue trigger wrappers as username collisions", () => {
    expect(isAuthCreateCollision("Database error creating new user")).toBe(true);
    expect(isAuthCreateCollision("User already registered")).toBe(true);
    expect(isAuthCreateCollision("This username is already taken.")).toBe(true);
    expect(isAuthCreateCollision("Unable to create a login right now.")).toBe(false);
  });

  it("uses national mobile digits as the initial password", () => {
    expect(initialPasswordFromPhone("+91 9876543210")).toBe("9876543210");
    expect(initialPasswordFromPhone("98765 43210")).toBe("9876543210");
    expect(initialPasswordFromPhone("123")).toBeNull();
  });
});
