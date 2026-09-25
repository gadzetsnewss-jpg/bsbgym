import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20260920000015_username_auth.sql"),
  "utf8",
);

describe("username auth migration", () => {
  it("adds username and contact_number without dropping profiles", () => {
    expect(migration).toMatch(/add column if not exists username text/);
    expect(migration).toMatch(/add column if not exists contact_number text/);
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/drop column/i);
  });

  it("enforces case-insensitive username uniqueness", () => {
    expect(migration).toMatch(/create unique index if not exists profiles_username_lower_unique/);
    expect(migration).toMatch(/on public\.profiles \(lower\(username\)\)/);
  });

  it("does not expose auth emails through a public lookup RPC", () => {
    expect(migration).toMatch(/revoke all on function public\.auth_email_for_username\(text\) from public, anon, authenticated/);
    expect(migration).toMatch(/grant execute on function public\.auth_email_for_username\(text\) to service_role/);
  });

  it("lets anonymous callers check username availability without returning profile rows", () => {
    expect(migration).toMatch(/grant execute on function public\.username_is_available\(text\) to anon, authenticated/);
    expect(migration).toMatch(/returns boolean/);
  });

  it("stores username and contact number from auth metadata on signup", () => {
    expect(migration).toMatch(/new\.raw_user_meta_data ->> 'username'/);
    expect(migration).toMatch(/new\.raw_user_meta_data ->> 'contact_number'/);
    expect(migration).toMatch(/username is already taken/);
  });

  it("prevents username changes after the first assignment", () => {
    expect(migration).toMatch(/username cannot be changed/);
  });
});
