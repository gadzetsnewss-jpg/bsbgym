import { afterEach, describe, expect, it } from "vitest";
import { getSupabaseServiceRoleKey } from "@/lib/server-env";

const ORIGINAL = process.env.SUPABASE_SERVICE_ROLE_KEY;

afterEach(() => {
  if (ORIGINAL === undefined) {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  } else {
    process.env.SUPABASE_SERVICE_ROLE_KEY = ORIGINAL;
  }
});

describe("getSupabaseServiceRoleKey", () => {
  it("returns undefined when the host env is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(getSupabaseServiceRoleKey()).toBeUndefined();
  });

  it("returns undefined for blank values", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "   ";
    expect(getSupabaseServiceRoleKey()).toBeUndefined();
  });

  it("reads the static host env at call time", () => {
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
    expect(getSupabaseServiceRoleKey()).toBe("test-service-role-key");
  });
});
