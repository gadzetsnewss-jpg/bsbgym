# Architecture

## Overview

Phase 3 introduces a multi-tenant organization foundation on top of the Phase 0
Next.js App Router shell. The stack is unchanged: Next.js 16.3.1 (App Router,
Turbopack), React 19, TypeScript strict, Tailwind v4, with Supabase for auth and
Postgres. The Phase 3 additions are `@supabase/ssr`, `zod` and `vitest`.

```
Browser
  │  AuthProvider / OrgProvider (client context)
  ▼
Middleware (session refresh + route protection)          src/middleware.ts
  ▼
Server layout guard  (resolveAppContext)                 src/app/(app)/layout.tsx
  ▼
Supabase (Auth + Postgres via @supabase/ssr)
  ▼
Database (migrations)  RLS = final security layer
```

## Multi-tenancy model

- One user can belong to many organizations; the app resolves exactly one
  "active membership" per request.
- **RLS is the final security layer.** Every table carries
  `organization_id` and every policy is built on the `is_org_member`,
  `is_org_admin` and `is_org_owner` helper functions (SECURITY DEFINER RPCs in
  `20260817000002_auth_org_rpcs.sql`).
- **Never trust a frontend-supplied `organization_id`.** All org-scoped mutations
  run through SECURITY DEFINER RPCs that derive `organization_id` from
  `auth.uid()`. RLS still applies underneath.
- **Branch selection is not a security mechanism.** The `bsb_branch` cookie is a
  UI preference for the current branch; `member_branches` / `access_all_branches`
  plus RLS enforce what a member may actually read/write.

## Database

Migrations live in `supabase/migrations/`:

- `20260817000001_auth_org_foundation.sql` - enums (`user_status`,
  `branch_status`, `organization_status`, `invitation_status`), tables
  (`organizations`, `branches`, `roles`, `role_permissions`, `profiles`,
  `organization_members`, `member_branches`, `invitations`,
  `invitation_branches`, `business_types`), triggers (`handle_new_user`,
  `set_updated_at`), RLS policies and the business-type seed.
- `20260817000002_auth_org_rpcs.sql` - SECURITY DEFINER RPCs:
  `is_org_member/is_org_admin/is_org_owner`, `create_organization`,
  `create_invitation`, `accept_invitation`, `revoke_invitation`,
  `update_member_role`, `set_member_status`, `update_member_branch_access`.
- `20260817000003_rbac_roles_audit.sql` - dynamic RBAC, granular permissions
  and audit logging: `roles.is_active`, the `audit_logs` table + select-only
  RLS + `record_audit_event`/`audit_event_trigger` (SECURITY DEFINER) + audit
  triggers, coarse-to-granular permission backfill, dropped direct write
  policies on `roles`/`role_permissions`, the `assert_caller_can_grant`
  escalation guard, role lifecycle RPCs (`create_role`, `update_role`,
  `set_role_permissions`, `set_role_status`) and hardened `create_organization`
  (7 default roles) / `create_invitation` / `update_member_role`.

Typed access: `src/lib/supabase/types.ts` is a hand-written `Database` type that
must stay in sync with the migrations. Regenerate with
`supabase gen types typescript --project-id <ref> --schema public` when a
Supabase project is available.

### Applying migrations

The migrations cannot be executed in this environment (no Supabase project /
CLI / Docker). To go live:

1. Create a Supabase project and set `NEXT_PUBLIC_SUPABASE_URL` /
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` in `.env.local`.
2. Apply `supabase/migrations/*.sql` (via `supabase db push`, the dashboard SQL
   editor, or your CI migration runner).

Until then the app runs in preview mode: every Supabase helper returns `null`
when `isSupabaseConfigured` is false, so the Phase 0 mock UI still works.

## Invitation token lifecycle

1. `create_invitation(p_org_id, p_email, p_role_id, p_branch_ids, p_all_branches,
   p_expires_hours)` validates the caller is an org admin, generates 32 random
   bytes (base64url-ish), stores `token_hash = SHA-256(token)` and returns the
   raw token **exactly once**.
2. `invitations.token_hash` is the only stored form. The column is REVOKEd from
   `anon`/`authenticated`, so normal queries can never leak a usable token.
3. `accept_invitation(p_token)` hashes the submitted token, then rejects when
   the invitation is not `pending`, is expired, or the email does not match the
   signed-in user. On success it atomically creates the membership, grants
   branch access and marks the invitation accepted.
4. `revoke_invitation` flips an invitation to `revoked`; expired/revoked
   invitations can never be accepted.

Dev flow: the invite dialog copies `/accept-invitation?token=<raw>`. Email
delivery is a later phase; the architecture (hash-only storage + one-time
return + email match) is the production shape.

## Permission model

Roles are database records seeded per organization by `create_organization`.
`src/lib/auth/permissions.ts` mirrors the seeded granular `role_permissions`
values (e.g. `members.view`, `billing.refund`, `reports.export`) and is the
single app-side source for gate checks. `hasPermission`/`hasAnyPermission`/
`hasAllPermissions`/`canAccessBranch`/`canGrantPermissions` decide UI
visibility only - RLS and the SECURITY DEFINER RPCs are the enforcement layer.
Role lifecycle writes go exclusively through the guarded RPCs
(`create_role`, `update_role`, `set_role_permissions`, `set_role_status`,
`update_member_role`) since the direct admin write policies on `roles` and
`role_permissions` are dropped. See `docs/RBAC.md` for the full model and
`docs/SECURITY.md` for the audit log and verification checklist.

## Audit logging

The `audit_logs` table records org/invitation/member/role/permission/branch
events, written only by the SECURITY DEFINER `record_audit_event` helper via
database triggers. RLS makes it select-only for org members; secrets
(passwords, tokens, invitation secrets) are never written. See
`docs/SECURITY.md`.

## Key files

| Area | Path |
| --- | --- |
| Env gate / preview mode | `src/lib/env.ts` |
| Browser client | `src/lib/supabase/client.ts` |
| Server client | `src/lib/supabase/server.ts` |
| Middleware client | `src/lib/supabase/middleware.ts` |
| Typed database | `src/lib/supabase/types.ts` |
| Server app context | `src/lib/auth/server.ts` |
| Client auth provider | `src/components/auth/auth-provider.tsx` |
| Org/branch provider | `src/components/auth/org-provider.tsx` |
| Route middleware | `src/middleware.ts` |
| Permission model | `src/lib/auth/permissions.ts` |
| Friendly errors | `src/lib/errors.ts` |
| Validation schemas | `src/lib/validation/auth-schemas.ts` |
| Org services | `src/lib/org/members.ts`, `src/lib/org/onboarding.ts` |
| Onboarding wizard | `src/components/onboarding/*` |
| Settings pages | `src/app/(app)/settings/profile|users-roles|permissions` |

## Decisions & deviations

- The original brief suggested Vite + React Router + a blue/near-black palette.
  The existing project is Next.js App Router with a teal/`primary-950` design
  system, so Phase 3 keeps the real stack and design instead of rebuilding.
- No fake credentials are ever generated; preview mode is an explicit
  "not configured" state (`isSupabaseConfigured`), not a mock login.
- All multi-write org operations are wrapped in SECURITY DEFINER RPCs so a
  failed half-transaction cannot corrupt membership or branch access.
- Middleware + server layout guard together prevent redirect loops and never
  render protected content before session restoration.

## Testing

- `npm test` - vitest unit tests: zod schemas, permissions, authorization
  utilities, error mapping, and static RBAC migration invariants
  (`src/lib/validation/auth-schemas.test.ts`,
  `src/lib/auth/permissions.test.ts`,
  `src/lib/auth/authorization.test.ts`,
  `src/lib/errors.test.ts`,
  `src/lib/org/rbac-migration.test.ts`).
- `npm run typecheck` - `tsc --noEmit`.
- `npm run build` - production build; all Phase 3 pages are statically
  validated by Next.js typed routes.
- Lint: no ESLint config or `lint` script exists in this repo (the scaffold
  ships with typecheck only), so there is no lint step to run. Static
  verification is `tsc --noEmit`; adding ESLint is intentionally out of scope
  for Phase 3 and can be layered on in a later phase without code changes.
