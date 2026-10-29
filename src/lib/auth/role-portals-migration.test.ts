import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261028000037_role_portals_and_first_login.sql"),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");
const signInRoute = readFileSync(join(process.cwd(), "src/app/api/auth/sign-in/route.ts"), "utf8");
const middleware = readFileSync(join(process.cwd(), "src/middleware.ts"), "utf8");
const provisionRoute = readFileSync(
  join(process.cwd(), "src/app/api/org/provision-login/route.ts"),
  "utf8",
);

describe("role portal migration", () => {
  it("adds a trigger-guarded must_change_password flag", () => {
    expect(migration).toMatch(/add column if not exists must_change_password boolean not null default false/);
    expect(migration).toMatch(/must_change_password cannot be changed/);
    expect(migration).toMatch(/grant execute on function public\.complete_password_change\(uuid\) to service_role/);
    expect(migration).toMatch(
      /revoke all on function public\.complete_password_change\(uuid\) from public, anon, authenticated/,
    );
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/disable row level security/i);
  });

  it("keeps ID lookup RPCs on service_role", () => {
    expect(migration).toMatch(
      /revoke all on function public\.auth_email_for_member_code\(text\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.auth_email_for_member_code\(text\) to service_role/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.auth_email_for_trainer_code\(text\) from public, anon, authenticated/,
    );
    expect(migration).toMatch(/require_org_permission\(v_org_id, 'users\.manage'\)/);
  });

  it("is included in COMBINE.sql", () => {
    expect(combine).toMatch(/20261028000037_role_portals_and_first_login\.sql/);
    expect(combine).toMatch(/create or replace function public\.provision_linked_login/);
  });
});

describe("role portal app surface", () => {
  it("exposes owner trainer and member login paths", () => {
    expect(middleware).toMatch(/\/owner\/login/);
    expect(middleware).toMatch(/\/trainer\/login/);
    expect(middleware).toMatch(/\/member\/login/);
    expect(middleware).toMatch(/\/change-password/);
  });

  it("resolves portal IDs server-side and still returns ok only", () => {
    expect(signInRoute).toMatch(/auth_email_for_member_code/);
    expect(signInRoute).toMatch(/auth_email_for_trainer_code/);
    expect(signInRoute).toMatch(/roleMatchesPortal/);
    expect(signInRoute).toMatch(/return NextResponse\.json\(\{ ok: true \}\)/);
    expect(signInRoute).not.toMatch(/userId:/);
  });

  it("creates logins with the registered mobile as the initial password only", () => {
    expect(provisionRoute).toMatch(/initialPasswordFromPhone/);
    expect(provisionRoute).toMatch(/admin\.auth\.admin\.createUser/);
    expect(provisionRoute).toMatch(/provision_linked_login/);
    expect(provisionRoute).not.toMatch(/plaintext/);
  });
});
