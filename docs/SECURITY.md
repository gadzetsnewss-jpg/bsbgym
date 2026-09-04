# Security

How BSB FitForge keeps data safe: authentication, authorization, multi-tenant
isolation, audit logging, and the rule that **the database is the final
security boundary**. This complements `docs/ARCHITECTURE.md` and
`docs/RBAC.md`.

## Threat model

The application is a multi-tenant gym ERP. The primary risks:

- **Cross-tenant data leakage** - a user reading another organization's rows.
- **Privilege escalation** - a non-admin granting themselves admin/owner powers.
- **Branch bypass** - a member accessing a branch they were not granted.
- **Invitation abuse** - replaying, guessing or forging invitation tokens.
- **Credential leakage** - passwords, session tokens or invitation secrets
  reaching logs, the frontend or the audit trail.

## Defense in depth

Every security decision is enforced at the database layer. The frontend gating
(sidebar hiding, button disabling) is presentational convenience only.

```
1. Supabase Auth        - passwords hashed by Supabase, never in our DB
2. RLS policies         - org-scoped SELECT/INSERT/UPDATE/DELETE per table
3. SECURITY DEFINER RPC - every multi-row / security-sensitive mutation,
                          deriving organization_id from auth.uid()
4. App guards           - middleware + server layout redirect unauthenticated
5. UI gating            - hasPermission/can() (cosmetic, not security)
```

## Multi-tenancy isolation

- Every tenant table carries `organization_id` and has RLS policies built on
  the `is_org_member` / `is_org_admin` / `is_org_owner` helpers (SECURITY
  DEFINER).
- **`organization_id` is never trusted from the client.** Mutations run through
  RPCs that derive it from `auth.uid()`; even then RLS applies underneath.
- A member's app context only ever contains their own organization, role,
  permissions and **authorized** branches. Non-active memberships
  (suspended/deactivated/invited) resolve to no context at all.

### Branch isolation

- `access_all_branches` grants everything; otherwise access is the explicit
  `member_branches` set.
- The `bsb_branch` cookie is a UI preference only. RLS + the RPCs validate
  branch access server-side, so tampering with the cookie, a URL param or a
  request body cannot grant access to another branch.
- Invitations carry their own `access_all_branches` / `invitation_branches`
  so access is granted atomically on acceptance.
- Migration `20260831000005` (Phase 1.2) tightens the `branches` SELECT policy
  to `is_org_member(organization_id) AND user_has_branch_access(organization_id, id)`
  and adds **composite FKs** (`member_branches`, `invitation_branches` on
  `(organization_id, branch_id) -> branches(organization_id, id)`) so a grant
  row can never point at another organization's branch. The policy uses the
  two-argument `user_has_branch_access(p_org_id, p_branch_id)` overload that
  never self-joins `branches`, keeping `INSERT ... RETURNING` correct.

## Role & permission security

- Roles are DB records; permissions are granular strings. Nothing is trusted
  from the client.
- **Privilege-escalation guard**: `assert_caller_can_grant` (SECURITY
  DEFINER) lets a non-owner grant only permissions they personally hold.
  Owners can grant anything.
- Direct admin write policies on `roles` / `role_permissions` are **dropped** -
  all writes go through the guarded RPCs, so the guard cannot be bypassed via
  the REST API.
- Only the owner can change the owner role, assign owner/admin, or invite an
  admin. System roles cannot be deactivated. Roles with active members cannot
  be deactivated.
- The organization owner can never be deactivated (`set_member_status`
  refuses).
- **Phase 1.2**: the full 56-permission catalogue is seeded per organization by
  `seed_default_role_permissions` (SECURITY DEFINER, execution revoked from
  `public`/`anon`/`authenticated`); the trainer default role is excluded from
  billing, GST, payments, finance, reports, staff and organization management.
- **App-level gate**: `src/config/route-permissions.ts` + the `(app)` layout
  redirect unauthorized members to `/access-denied`. Cosmetic checks use
  `hasRole()` in addition to `hasPermission()`.

## Invitation security

- Tokens are 32 random bytes; only `token_hash = SHA-256(token)` is stored.
- `invitations.token_hash` is REVOKEd from `anon`/`authenticated`, so queries
  can never leak a usable token.
- The raw token is returned exactly once at creation and rendered in the dev
  invite flow.
- `accept_invitation` requires the invitation be `pending`, unexpired, and the
  signed-in email match the invited email. Revoked/expired invitations can
  never be accepted.
- **Crypto qualification fix (`000006`)**: `gen_random_bytes` and `digest` live
  in the `extensions` schema but were called unqualified while the RPCs force
  `search_path = public`, so the whole invite flow broke at runtime. The RPCs
  are recreated with `extensions.`-qualified calls.

## Audit logging

`audit_logs` records `organization.created`, `invitation.created/accepted/
revoked/expired/updated`, `member.joined/removed/role_changed/status_changed/
reactivated/branch_access_changed/updated`, `role.created/updated/reactivated/
deactivated` and `role.permission_granted/permission_revoked`.

- **Select-only for org members** (RLS). Writes go exclusively through the
  SECURITY DEFINER `record_audit_event`, which is **not** granted to
  `anon`/`authenticated`, so callers cannot forge audit entries.
- **Secrets are never logged**: passwords, access/refresh tokens and
  invitation secrets are excluded by design (enforced in the trigger and
  covered by `src/lib/org/rbac-migration.test.ts`).

## Error handling

RPCs return plain strings (`raise exception`). `src/lib/errors.ts` maps them
to friendly, typed categories - Unauthorized, Forbidden, Not Found, Session
Expired, Invalid/Expired Invitation, Duplicate User, Database Failure, Network
Failure - before they reach the UI. **Raw PostgreSQL errors are never shown**
to users (verified by `src/lib/errors.test.ts`).

Auth errors map to the spec messages via `toAuthErrorMessage()`
(`src/lib/auth/session.ts`, covered by `session-errors.test.ts`):

- Bad credentials -> "Email or password is incorrect."
- Forbidden area -> "You don't have permission to access this area."
- Expired/invalid session -> "Your session has expired. Please sign in again."
- Unknown failures fall back to a generic message - never a database error.

## Session management

- Sessions live in httpOnly cookies via `@supabase/ssr`; middleware refreshes
  them on every request.
- Suspended/deactivated members are treated as unauthenticated and cannot reach
  protected resources.
- Profile edits are restricted to the signed-in user's own `profiles` row.
- The middleware exposes the current pathname via an `x-pathname` request
  header so the `(app)` layout can enforce route permissions server-side and
  redirect to `/access-denied` before rendering.

## Local development vs. production

In this environment the app runs in preview mode (`isSupabaseConfigured =
false`) when no Supabase credentials are configured. A real Supabase project
(`xwornvqtepbliehmrisp`) has been used for live verification - all migrations
through `20260831000006` are applied there and the checklist below has been
run against it.

## Verification checklist (to run against a real Supabase project)

1. **RLS is active** on `organizations`, `branches`, `roles`,
   `role_permissions`, `organization_members`, `member_branches`,
   `invitations`, `invitation_branches`, `audit_logs`.
2. **Isolation**: sign in as org A and confirm org B's rows are invisible and
   unmodifiable through the REST API. (Verified live: org B owner/staff/trainer
   vs org A.)
3. **Branch isolation**: a member without access to branch X cannot read or
   write X's rows, even with a forged `branch_id` in the URL/body/cookie.
   (Verified live: org B staff sees only Head Office and is rejected on branch
   INSERT.)
4. **Escalation**: a non-owner cannot call `set_role_permissions` with
   permissions they do not hold, and cannot create/assign admin or owner roles.
5. **Owner protection**: the owner cannot be deactivated, and owner/admin
   assignment is rejected for non-owners.
6. **Invitation replay**: an accepted, revoked or expired token is rejected;
   a token for a different email is rejected. (Invite -> accept flow re-verified
   after the `000006` crypto fix.)
7. **Audit integrity**: audit rows appear for each listed event and contain no
   secrets; direct `insert into audit_logs` is rejected for `authenticated`.
8. **Deactivated roles** cannot be assigned or invited; system roles cannot be
   deactivated; roles with active members cannot be deactivated.
9. **Trainer restriction** (Phase 1.2): a trainer cannot reach billing, GST,
   finance/reports, staff, or organization management via the UI routes or the
   REST API, but keeps their allowed areas. (Verified live against the dev
   server with a session cookie.)
10. **Protected routes**: unauthenticated `/dashboard` redirects to
    `/login?next=...`; unauthorized members land on `/access-denied`; the
    owner can reach every protected page.
11. **No privilege escalation on the app side**: the UI offers no self role
    change / self-promotion path and no ability to mint an owner.
