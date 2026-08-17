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

## Invitation security

- Tokens are 32 random bytes; only `token_hash = SHA-256(token)` is stored.
- `invitations.token_hash` is REVOKEd from `anon`/`authenticated`, so queries
  can never leak a usable token.
- The raw token is returned exactly once at creation and rendered in the dev
  invite flow.
- `accept_invitation` requires the invitation be `pending`, unexpired, and the
  signed-in email match the invited email. Revoked/expired invitations can
  never be accepted.

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

## Session management

- Sessions live in httpOnly cookies via `@supabase/ssr`; middleware refreshes
  them on every request.
- Suspended/deactivated members are treated as unauthenticated and cannot reach
  protected resources.
- Profile edits are restricted to the signed-in user's own `profiles` row.

## Local development vs. production

This environment has no Supabase project, so migrations/RLS cannot be executed
here. The app runs in preview mode (`isSupabaseConfigured = false`). Before
going live, apply the migrations and then verify with the checklist below.

## Verification checklist (to run against a real Supabase project)

1. **RLS is active** on `organizations`, `branches`, `roles`,
   `role_permissions`, `organization_members`, `member_branches`,
   `invitations`, `invitation_branches`, `audit_logs`.
2. **Isolation**: sign in as org A and confirm org B's rows are invisible and
   unmodifiable through the REST API.
3. **Branch isolation**: a member without access to branch X cannot read or
   write X's rows, even with a forged `branch_id` in the URL/body/cookie.
4. **Escalation**: a non-owner cannot call `set_role_permissions` with
   permissions they do not hold, and cannot create/assign admin or owner roles.
5. **Owner protection**: the owner cannot be deactivated, and owner/admin
   assignment is rejected for non-owners.
6. **Invitation replay**: an accepted, revoked or expired token is rejected;
   a token for a different email is rejected.
7. **Audit integrity**: audit rows appear for each listed event and contain no
   secrets; direct `insert into audit_logs` is rejected for `authenticated`.
8. **Deactivated roles** cannot be assigned or invited; system roles cannot be
   deactivated; roles with active members cannot be deactivated.
