# Role-Based Access Control (RBAC)

Phase 3 Part 2 introduces dynamic, database-driven roles and granular
permissions on top of the Part 1 RBAC schema (`roles`, `role_permissions`,
`organization_members`, `member_branches`).

## Model

- **Roles are database records**, not hardcoded application logic. Each role
  belongs to an organization and carries its own permission set.
- **Permissions are granular**: `members.view/create/update/delete/export`,
  `memberships.view/create/update`, `billing.view/create/refund/export`,
  `attendance.view/create`, `trainers.view`, `reports.view/export`,
  `settings.view/manage`, `users.view/manage`, `roles.view/manage`,
  `branches.view/manage`, `dashboard.view`, `invites.send`, plus
  `classes/inventory/crm/finance view/manage`.
- **The database is the source of truth.** `src/lib/auth/permissions.ts`
  mirrors the seeded `role_permissions` values; `hasPermission`/`can()` only
  decide UI visibility. RLS + SECURITY DEFINER RPCs are the real enforcement.

## Default roles

`create_organization` seeds seven roles per organization:

| Role | `is_system` | Deactivatable | Notes |
| --- | --- | --- | --- |
| `owner` | yes | no | Cannot be invited/assigned; only the owner manages it |
| `admin` | yes | no | Full administration; only the owner assigns it |
| `manager` | yes | no | Operational management subset |
| `staff` | yes | no | Base staff permissions |
| `receptionist` | no | yes | Front desk subset (editable) |
| `trainer` | no | yes | Trainer subset (editable) |
| `accountant` | no | yes | Finance/billing subset (editable) |

`receptionist`, `trainer` and `accountant` are configurable default roles -
admins may edit their permissions or deactivate them. `is_system` roles are
protected: they cannot be deactivated, and the owner role can only be changed
by the owner.

## Permission model

`src/lib/auth/permissions.ts` defines the full set:

- `dashboard.view`
- `members.view` / `create` / `update` / `delete` / `export`
- `memberships.view` / `create` / `update`
- `billing.view` / `create` / `refund` / `export`
- `attendance.view` / `create`
- `trainers.view`
- `classes.view` / `manage`
- `inventory.view` / `manage`
- `crm.view` / `manage`
- `finance.view` / `manage`
- `reports.view` / `export`
- `settings.view` / `manage`
- `users.view` / `manage`
- `roles.view` / `manage`
- `branches.view` / `manage`
- `invites.send`

> Migration `20260817000003` backfills the coarse `*.manage` permissions
> (members/memberships/billing/attendance) into their granular equivalents and
> deletes the coarse rows, so organizations created before the migration keep
> an equivalent permission surface.

## Authorization helpers

Client-side helpers in `src/lib/auth/permissions.ts` (mirrored by the RPCs):

| Helper | Purpose |
| --- | --- |
| `hasPermission(permissions, p)` | Single-permission gate |
| `hasAnyPermission(permissions, list)` | Any-of gate |
| `hasAllPermissions(permissions, list)` | All-of gate |
| `canAccessBranch(member, authorized, branchId)` | Branch-level gate (UI mirror) |
| `isOrganizationMember(member)` | Active-membership check |
| `canGrantPermissions(caller, requested)` | Privilege-escalation guard (UI mirror) |

`useOrganization()` exposes `can`, `canAny`, `canAll` and `canAccessBranch`
for page-level gating.

## Role lifecycle RPCs

All SECURITY DEFINER, all validate the caller is an org admin, all use
`set search_path = public`:

| RPC | Behavior |
| --- | --- |
| `create_role(p_org_id, p_name, p_slug, p_description, p_permissions)` | Creates a non-system role with a permission set; slugs are immutable and unique per org |
| `update_role(p_role_id, p_name, p_description)` | Renames / re-describes a role |
| `set_role_permissions(p_role_id, p_permissions)` | Replaces the full permission set |
| `set_role_status(p_role_id, p_active)` | Deactivates / reactivates a role |
| `update_member_role(p_member_id, p_role_id)` | Assigns a role to a member |

### Guards

- **Privilege escalation**: `assert_caller_can_grant` - a non-owner may only
  grant permissions they personally hold; owners may grant anything.
- **Owner role** can only be changed by the owner
  (`only the owner can change the owner role permissions`).
- **System roles cannot be deactivated**; a role assigned to active members
  cannot be deactivated (`reassign members before deactivating this role`).
- **Deactivated roles** cannot be assigned or invited
  (`role does not belong to this organization or is deactivated`).
- **Owner/admin assignment** is owner-only
  (`only the owner can assign the owner or admin role`); the owner role cannot
  be invited and there is always exactly one owner
  (`this organization already has an owner`).

## Role management UI

`/settings/permissions` (`src/components/settings/roles-manager.tsx`) lists
every role with its permissions and active member count and lets admins:

- Create a role (name, slug, description, permission set)
- Edit a role's name/description and permission set
- Deactivate / reactivate a role

The permission picker disables options the caller does not hold (mirroring the
server's escalation guard), and deactivation is blocked for system roles and
roles with active members. Deactivated roles are filtered out of the role
picker on `/settings/users-roles` and the invite dialog.

## Permission-aware navigation

`NavItem.permission` (optional) in `src/config/navigation.ts` gates sidebar
visibility via `useOrganization().can()`. Reports require `reports.view`,
user management requires `users.view`, the roles manager requires
`roles.view`, and admin settings require `settings.view`. **Hiding is not
security** - RLS and the server-side guards are the real boundary; navigation
filtering is purely presentational and everything remains server-enforced.

## RLS posture

- Direct `roles` / `role_permissions` admin write policies are **dropped** in
  migration `000003`; all writes go through the guarded RPCs so the escalation
  guard cannot be bypassed via the REST API.
- `audit_logs` is select-only for org members; writes happen exclusively
  through the SECURITY DEFINER `record_audit_event` helper (not granted to
  `anon`/`authenticated`), so callers cannot forge audit entries.

## Testing

- `src/lib/auth/permissions.test.ts` - permission constants, role helpers,
  `canGrantPermissions`, permission options.
- `src/lib/auth/authorization.test.ts` - any/all/branch/membership/escalation
  rules.
- `src/lib/org/rbac-migration.test.ts` - static migration invariants
  (backfill, audit RLS, RPC guards).
