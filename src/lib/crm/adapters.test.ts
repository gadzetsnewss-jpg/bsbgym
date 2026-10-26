/**
 * Static invariants for CRM table adapters (Phase 6).
 *
 * PostgREST cannot embed `branches` when both the simple branch_id FK and the
 * composite (organization_id, branch_id) FK exist. Hint the simple FK, matching
 * gym_members.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const adapters = readFileSync(
  join(process.cwd(), "src", "lib", "crm", "adapters.ts"),
  "utf8",
);

describe("CRM adapters", () => {
  it("disambiguates branch embeds so PostgREST can resolve dual FKs", () => {
    expect(adapters).toMatch(/branches!leads_branch_id_fkey\(id, name, code\)/);
    expect(adapters).toMatch(/branches!follow_ups_branch_id_fkey\(id, name, code\)/);
    expect(adapters).toMatch(/branches!trial_memberships_branch_id_fkey\(id, name, code\)/);
    expect(adapters).not.toMatch(/branches\(id, name, code\)/);
  });
});
