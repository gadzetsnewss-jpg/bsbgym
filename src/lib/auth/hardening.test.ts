/**
 * Source-level Phase 10 auth hardening checks.
 *
 * Live RLS cannot run against remote Supabase from this environment, so these
 * tests lock the write surface: sign-in never returns a user id, and profile
 * updates never send privileged columns.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const signInRoute = read("src/app/api/auth/sign-in/route.ts");
const session = read("src/lib/auth/session.ts");
const profile = read("src/lib/auth/profile.ts");
const types = read("src/lib/supabase/types.ts");

describe("sign-in response", () => {
  it("does not return a user id to the browser", () => {
    expect(signInRoute).toMatch(/return NextResponse\.json\(\{ ok: true \}\)/);
    expect(signInRoute).not.toMatch(/userId:/);
    expect(session).toMatch(/payload\.ok/);
    expect(session).not.toMatch(/payload\.userId/);
  });
});

describe("profile write surface", () => {
  it("only updates display fields on the caller's own row", () => {
    expect(profile).toMatch(/first_name: input\.firstName\.trim\(\)/);
    expect(profile).toMatch(/last_name: input\.lastName\.trim\(\)/);
    expect(profile).toMatch(/\.eq\("id", input\.profileId\)/);
    expect(profile).not.toMatch(/status:/);
    expect(profile).not.toMatch(/org_id:/);
    expect(profile).not.toMatch(/branch_id:/);
    expect(profile).not.toMatch(/username:/);
    expect(profile).not.toMatch(/email:/);
  });

  it("keeps privileged profile columns out of the generated Update type", () => {
    const profilesStart = types.indexOf("profiles:");
    const updateStart = types.indexOf("Update: Partial<{", profilesStart);
    const updateBlock = types.slice(updateStart, types.indexOf("Relationships:", updateStart));
    expect(updateBlock).toMatch(/first_name: string/);
    expect(updateBlock).toMatch(/last_name: string/);
    expect(updateBlock).not.toMatch(/status/);
    expect(updateBlock).not.toMatch(/org_id/);
    expect(updateBlock).not.toMatch(/branch_id/);
    expect(updateBlock).not.toMatch(/username/);
    expect(updateBlock).not.toMatch(/email/);
    expect(updateBlock).not.toMatch(/must_change_password/);
  });
});
