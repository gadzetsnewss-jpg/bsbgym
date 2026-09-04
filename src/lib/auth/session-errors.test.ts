/**
 * Unit tests for the Phase 1.2 auth error mapping. Verifies the spec's public
 * messages are produced and database internals are never leaked.
 */

import { describe, expect, it } from "vitest";
import { toAuthErrorMessage } from "@/lib/auth/session";

describe("toAuthErrorMessage", () => {
  it("maps invalid login credentials to the spec message", () => {
    expect(
      toAuthErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" }),
    ).toBe("Email or password is incorrect.");
    expect(
      toAuthErrorMessage({ message: "invalid login credentials", code: "" }),
    ).toBe("Email or password is incorrect.");
  });

  it("maps missing/expired sessions to the spec message", () => {
    expect(
      toAuthErrorMessage({ message: "Auth session missing!", code: "session_missing" }),
    ).toBe("Your session has expired. Please sign in again.");
    expect(
      toAuthErrorMessage({ message: "refresh_token_not_found", code: "refresh_token_not_found" }),
    ).toBe("Your session has expired. Please sign in again.");
  });

  it("maps authorization failures to the access-denied message", () => {
    expect(
      toAuthErrorMessage({ message: "new row violates row-level security policy", code: "42501" }),
    ).toBe("You don't have permission to access this area.");
    expect(
      toAuthErrorMessage({ message: "insufficient privileges", code: "42501" }),
    ).toBe("You don't have permission to access this area.");
  });

  it("never leaks database internals", () => {
    const leaked = toAuthErrorMessage({
      message: "Database error saving new row: relation \"members\" does not exist",
      code: "42P01",
    });
    expect(leaked).toBe("Something went wrong. Please try again.");
    expect(leaked.toLowerCase()).not.toContain("relation");
    expect(leaked.toLowerCase()).not.toContain("sql");
  });

  it("falls back to a safe message for unknown errors", () => {
    expect(toAuthErrorMessage(null)).toBe("Something went wrong. Please try again.");
    expect(toAuthErrorMessage({})).toBe("Something went wrong. Please try again.");
  });

  it("keeps user-safe messages that do not match any known pattern", () => {
    expect(toAuthErrorMessage({ message: "User already registered", code: "user_exists" }))
      .toBe("User already registered");
  });
});
