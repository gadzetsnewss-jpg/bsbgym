import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase", "migrations", "20261008000029_upsert_branch_setting.sql"),
  "utf8",
);

describe("upsert_branch_setting migration", () => {
  it("writes through SECURITY DEFINER and re-checks admin plus branch membership", () => {
    expect(migration).toMatch(/create or replace function public\.upsert_branch_setting\(/);
    expect(migration).toMatch(/security definer/);
    expect(migration).toMatch(/if not public\.is_org_admin\(p_org_id\)/);
    expect(migration).toMatch(/perform public\.require_branch_in_org\(p_org_id, p_branch_id\)/);
    expect(migration).toMatch(/insert into public\.branch_settings/);
    expect(migration).toMatch(/on conflict \(branch_id, setting_key\)/);
    expect(migration).toMatch(/grant execute on function public\.upsert_branch_setting/);
    expect(migration).not.toMatch(/delete from public\.branch_settings/i);
  });
});
