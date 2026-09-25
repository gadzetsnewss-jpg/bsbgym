# Organization Onboarding

New signed-up users land on `/onboarding` (guarded by `src/app/onboarding/layout.tsx`)
and complete a 5-step wizard before getting access to the app.

## Flow

1. `Account` - first/last name (already known from sign-up, editable). Continue
   writes the signed-in profile.
2. `Business` - name, legal name, business type (from the `business_types`
   reference table, seeded in the migration), address, tax ID. Continue
   persists these fields onto the draft organization.
3. `Branch` - the first branch (name, unique code, contact, address, timezone).
   Continue stores a draft on the same organization; the real branch row is
   created on Complete.
4. `Preferences` - currency / timezone / date format defaults. Continue
   UPDATEs the draft organization.
5. `Review` - summary, then submit.

## What happens on each Continue

`src/lib/org/onboarding.ts` calls a SECURITY DEFINER RPC for the current step.
The database derives identity from `auth.uid()`. The client never sends an
organization or branch id. Returning to `/onboarding` prefills from
`get_onboarding_organization` and resumes at the first incomplete step.

The wizard does not advance until that write succeeds.

## What happens on submit

`src/lib/org/onboarding.ts` calls the `create_organization` SECURITY DEFINER
RPC. In a single transaction the database:

1. UPDATEs the existing draft organization when one exists; otherwise INSERTs
   a new organization (`created_by = auth.uid()`). It never creates a second
   org for a user who already has a draft or an active membership.
2. Seeds the seven default roles (`owner`, `admin`, `manager`, `staff` as
   protected system roles plus configurable `receptionist`, `trainer`,
   `accountant`) and their granular `role_permissions` if they are not
   already present.
3. Creates the owner membership (`access_all_branches = true`, status `active`).
4. Creates the first branch with the user's chosen code (normalized to
   uppercase) and grants the owner all-branch access.

The RPC validates input (name, branch code format, currency/timezone present)
and raises exceptions on failure so the UI can show a clear error.
`organization_id` is always derived server-side from `auth.uid()` - never
trusted from the frontend.

After success the wizard hard-navigates to `/dashboard` (with an Open
dashboard fallback if the browser stays on the completion screen).

## Wizard implementation

- `src/components/onboarding/onboarding-wizard.tsx` - client component that
  holds the combined form state, per-step zod schemas
  (`src/lib/validation/auth-schemas.ts`), a progress bar and the submit action.
- `src/components/onboarding/stepper.tsx` - step indicator.
- `src/components/onboarding/fields.tsx` - reusable `AddressFields`,
  `ContactFields` and `TimezoneField`, populated from the `COUNTRIES`,
  `TIMEZONES`, `DATE_FORMATS` and `CURRENCIES` option sets (configurable data,
  not hardcoded business rules).

Every step shows loading, error, disabled and retry states; duplicate submits
are prevented while the RPC is in flight.

## Business types are configurable

Business types live in the `business_types` table (seeded, RLS-readable for
authenticated users). The app reads them at runtime instead of hardcoding them,
so new business categories can be added without a deploy.
