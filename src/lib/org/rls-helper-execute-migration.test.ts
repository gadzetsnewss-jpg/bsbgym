/**
 * Static invariants for restoring EXECUTE on RLS policy helpers.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261027000035_grant_rls_helper_execute.sql"),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");

describe("RLS helper EXECUTE grant", () => {
  it("grants authenticated EXECUTE and keeps anon revoked", () => {
    expect(migration).toMatch(
      /grant execute on function public\.current_org_role_slug\(uuid\) to authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.linked_trainer_id\(uuid\) to authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.linked_gym_member_id\(uuid\) to authenticated/,
    );
    expect(migration).toMatch(
      /grant execute on function public\.can_view_member_data\(uuid, uuid\) to authenticated/,
    );
    expect(migration).toMatch(
      /revoke all on function public\.current_org_role_slug\(uuid\) from public, anon/,
    );
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/disable row level security/i);
  });

  it("is included in COMBINE.sql", () => {
    expect(combine).toMatch(/20261027000035_grant_rls_helper_execute\.sql/);
    expect(combine).toMatch(
      /grant execute on function public\.can_view_member_data\(uuid, uuid\) to authenticated/,
    );
  });
});
