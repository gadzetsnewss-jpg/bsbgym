# Authentication & Session Management

Phase 3 adds Supabase Auth with centralized session handling, route protection,
and a signed-in app context. All auth is handled by Supabase Auth - passwords
are never stored in PostgreSQL or our application; they are hashed and verified
by Supabase Auth.

## How sign-in works

1. `src/app/(auth)/login/page.tsx` validates the form with `loginSchema`
   (zod) and calls `useAuth().signIn()`.
2. `AuthProvider` (`src/components/auth/auth-provider.tsx`) wraps
   `supabase.auth.signInWithPassword` and exposes `status`:
   `loading | authenticated | unauthenticated`.
3. On success the user is redirected via the `?next=` query param (default
   `/dashboard`).

- Sign up (`/signup`): email + password + names. Confirmation is sent by
  Supabase; the success screen points back to `/login?verified=email`.
- Forgot password (`/forgot-password`): calls `supabase.auth.resetPasswordForEmail`.
- Reset password (`/reset-password`): exchanges the PKCE `?code=` for a session
  via `exchangeCodeForSession` (`src/lib/auth/session.ts`) before updating the
  password, so the new password is set with a fresh session.

## Session persistence

- `@supabase/ssr` manages the auth cookies. `src/lib/supabase/client.ts`
  exposes a singleton browser client; `src/lib/supabase/server.ts` creates a
  request-scoped server client bound to `next/headers` cookies.
- `src/lib/supabase/middleware.ts` (`updateSession`) refreshes the session and
  rewrites the response cookies on every middleware run.
- `src/middleware.ts` calls `updateSession` for every request and applies route
  protection (see below).

## Route protection

`src/middleware.ts` categorizes routes:

| Category | Paths | Behavior |
| --- | --- | --- |
| Public | `/login`, `/signup`, `/forgot-password`, `/reset-password` | Signed-in users are redirected to `/dashboard` |
| Protected | everything else under `(app)` and `/onboarding` | Unauthenticated users go to `/login?next=<original>` |

`src/app/(app)/layout.tsx` is the second guard layer: it resolves the full app
context server-side and redirects:

- `not_configured` -> renders the mock UI (preview mode) so Phase 0 still works
- `unauthenticated` -> `/login?next=...`
- `no_organization` -> `/onboarding`
- `ok` -> seeds `AuthProvider` and `OrgProvider` with the resolved context

`src/app/(auth)/layout.tsx` guards the auth screens (redirects signed-in users)
and `src/app/onboarding/layout.tsx` requires an authenticated user with no
organization.

No protected screen is shown before session restoration completes; the layout
checks happen before any provider renders content.

## Centralized app context

`resolveAppContext()` (`src/lib/auth/server.ts`) runs once per protected
request and returns the profile, active organization, membership role,
permissions and authorized branches. It is seeded into the client providers
(`AuthProvider` + `OrgProvider`), so pages never re-fetch identity data.
`useOrganization()` exposes `profile`, `organization`, `member`, `branches`,
`currentBranch`, `can(permission)`, `isAdmin` and `isOwner`.

## Account status rules

User status (`active | invited | suspended | deactivated`) is enforced in a
single place: `resolveAppContext()` only returns an app context when the
membership row is `active`. Suspended/deactivated users are treated as
unauthenticated and cannot reach protected resources. Status changes go through
the `set_member_status` RPC which refuses to deactivate the organization owner.

## Profile editing

`updateProfile` (`src/lib/auth/profile.ts`) can only ever update the signed-in
user's own `profiles` row - both RLS (`WHERE auth.uid() = id`) and the service
enforce this. Users cannot change their own organization ownership, role or
permissions through any UI.

## Invitations (dev flow)

Invitations are created via the `create_invitation` RPC which returns a raw
one-time token. Email delivery is not wired up yet, so the invite dialog shows
a copyable link (`/accept-invitation?token=<raw>`). Tokens are stored only as
SHA-256 hashes (`invitations.token_hash`) and the raw column is REVOKEd from
`anon`/`authenticated`. See `docs/ARCHITECTURE.md` for the token lifecycle.
