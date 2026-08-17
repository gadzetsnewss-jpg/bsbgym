/**
 * Unit tests for the friendly error mapper (Phase 3 Part 2).
 */

import { describe, expect, it } from "vitest";
import { toFriendlyError, friendlyMessage } from "@/lib/errors";

describe("toFriendlyError", () => {
  it("maps authentication failures to session_expired", () => {
    expect(toFriendlyError({ message: "not authenticated" }).code).toBe("session_expired");
    expect(toFriendlyError({ message: "JWT expired" }).code).toBe("session_expired");
  });

  it("maps permission errors to forbidden", () => {
    expect(toFriendlyError({ message: "insufficient privileges" }).code).toBe("forbidden");
    expect(toFriendlyError({ message: "you cannot grant permissions you do not hold" }).code).toBe("forbidden");
    expect(toFriendlyError({ message: "only the owner can change the owner role" }).code).toBe("forbidden");
    expect(toFriendlyError({ message: "system roles cannot be deactivated" }).code).toBe("forbidden");
  });

  it("maps invitation errors to invalid_invitation", () => {
    expect(toFriendlyError({ message: "invitation is invalid or has expired" }).code).toBe("invalid_invitation");
    expect(toFriendlyError({ message: "this invitation is no longer valid" }).code).toBe("invalid_invitation");
  });

  it("maps duplicate errors to duplicate_user", () => {
    expect(toFriendlyError({ message: "an active invitation already exists for this email" }).code).toBe("duplicate_user");
    expect(toFriendlyError({ message: "user already exists" }).code).toBe("duplicate_user");
  });

  it("maps not-found errors to not_found", () => {
    expect(toFriendlyError({ message: "role not found" }).code).toBe("not_found");
    expect(toFriendlyError({ message: "member could not be found" }).code).toBe("not_found");
  });

  it("preserves useful validation messages", () => {
    expect(toFriendlyError({ message: "a valid email is required" }).code).toBe("validation");
    expect(toFriendlyError({ message: "role slug is required" }).code).toBe("validation");
  });

  it("falls back to database for unexpected errors", () => {
    expect(toFriendlyError({ message: "duplicate key value violates unique constraint" }).code).toBe("database");
    expect(toFriendlyError(new Error("boom")).code).toBe("database");
  });

  it("handles unknown/empty inputs without throwing", () => {
    expect(toFriendlyError(null).code).toBe("database");
    expect(toFriendlyError(undefined).code).toBe("database");
    expect(toFriendlyError("").code).toBe("database");
  });
});

describe("friendlyMessage", () => {
  it("never surfaces raw PostgreSQL errors", () => {
    const message = friendlyMessage({ message: 'duplicate key value violates unique constraint "roles_slug_org_unique"' });
    expect(message).not.toContain("duplicate key");
    expect(message).not.toContain("constraint");
  });

  it("returns the friendly message for known categories", () => {
    expect(friendlyMessage({ message: "insufficient privileges" })).toBe(
      "You don't have permission to do that.",
    );
  });
});
