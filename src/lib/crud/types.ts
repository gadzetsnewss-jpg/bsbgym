/**
 * Shared CRUD resource model (Phase 3.2).
 *
 * Every module screen (list + form + detail) is declared as a `ResourceConfig`
 * and served by the generic components under `src/components/crud`. This keeps
 * the SaaS look, validation, permission gates and error handling identical
 * across modules while each resource only declares its fields and columns.
 *
 * The engine never talks to Supabase directly: a resource supplies a
 * `ResourceAdapter` (see `src/lib/org/crud-adapter.ts`), so all writes still go
 * through SECURITY DEFINER RPCs and RLS stays the security boundary.
 */

import type * as React from "react";
import type { LucideIcon } from "lucide-react";
import type { SelectOption } from "@/components/ui/select";
import type { DropdownItem } from "@/components/ui/dropdown";
import type { OrgResult } from "@/lib/org/members";

/** Value types the generic form can hold. */
export type FieldValue = string | boolean;
export type ResourceValues = Record<string, FieldValue>;

export type ResourceFieldType =
  | "text"
  | "email"
  | "tel"
  | "url"
  | "number"
  | "textarea"
  | "select"
  | "date"
  | "datetime"
  | "checkbox";

/** Where a select field gets its options from. */
export type FieldOptionsSource = "branches";

export interface ResourceField {
  /** Key in the resource values object and the RPC payload. */
  name: string;
  label: string;
  type?: ResourceFieldType;
  required?: boolean;
  placeholder?: string;
  hint?: string;
  /** Static options for `type: "select"`. */
  options?: readonly SelectOption[];
  /** Dynamic options resolved by the form (e.g. the provider's branches). */
  optionsSource?: FieldOptionsSource;
  /** Async option loader for data-backed selects (e.g. trainers). */
  loadOptions?: (context: { organizationId: string }) => Promise<SelectOption[]>;
  /** Grid span within the section (default 1). */
  span?: 1 | 2;
  min?: number;
  max?: number;
  step?: number;
  rows?: number;
  /** Currency or unit adornments shown inside the control. */
  prefix?: string;
  suffix?: string;
  defaultValue?: FieldValue;
  autoComplete?: string;
  /** Value is displayed on the detail page but not editable in the form. */
  readOnly?: boolean;
  /** Field is hidden from the form (still shown on detail). */
  hidden?: boolean;
}

export interface ResourceFieldGroup {
  title: string;
  description?: string;
  columns?: 1 | 2;
  fields: readonly ResourceField[];
}

export type ResourceColumnFormat =
  | "text"
  | "muted"
  | "code"
  | "date"
  | "datetime"
  | "number"
  | "currency"
  | "boolean";

export interface ResourceColumn<TRow> {
  id: string;
  header: string;
  /** Custom cell renderer; takes precedence over `accessor`/`format`. */
  cell?: (row: TRow) => React.ReactNode;
  accessor?: (row: TRow) => unknown;
  format?: ResourceColumnFormat;
  align?: "left" | "right" | "center";
}

export interface ResourceFilter {
  /** Filter key sent to the adapter. */
  name: string;
  /** aria-label for the select. */
  label: string;
  /** Label for the "no filter" option. */
  allLabel: string;
  options?: readonly SelectOption[];
  /** Dynamic options from org context (e.g. branches). */
  optionsSource?: FieldOptionsSource;
}

/** Derives the active/inactive badge + state for a row. */
export interface ResourceStatusConfig<TRow> {
  /** Form field name that carries the boolean active state. */
  field: string;
  /** Form field label (default "Active"). */
  label?: string;
  fromRow: (row: TRow) => boolean;
  activeLabel?: string;
  inactiveLabel?: string;
}

export interface ResourceListParams {
  organizationId: string;
  search: string;
  page: number;
  pageSize: number;
  filters: Record<string, string>;
}

export interface ResourceAdapter<TRow> {
  list(params: ResourceListParams): Promise<OrgResult<{ rows: TRow[]; total: number }>>;
  get(organizationId: string, id: string): Promise<OrgResult<TRow>>;
  create(organizationId: string, values: ResourceValues): Promise<OrgResult<{ id: string }>>;
  update?(id: string, values: ResourceValues): Promise<OrgResult>;
  setActive?(id: string, active: boolean): Promise<OrgResult>;
  /** Maps a loaded row into form values for the edit screen. */
  toFormValues?(row: TRow): ResourceValues;
}

export interface ResourceConfig<TRow> {
  /** Stable identifier, also used for test/debug output. */
  key: string;
  /** Page title, e.g. "Trainers". */
  title: string;
  /** Singular noun used in copy and toasts, e.g. "trainer". */
  singular: string;
  description?: string;
  icon: LucideIcon;
  /** Base route, e.g. "/trainers". */
  routeBase: string;
  permissions: {
    view: string;
    create?: string;
    update?: string;
    delete?: string;
  };
  columns: readonly ResourceColumn<TRow>[];
  fields: readonly ResourceFieldGroup[];
  /** Field -> message validation, usually built with `fromZod`. */
  validate: (values: ResourceValues) => Record<string, string>;
  adapter: ResourceAdapter<TRow>;
  /** Human-readable record title for the detail page header. */
  displayName?: (row: TRow) => string;
  searchPlaceholder?: string;
  filters?: readonly ResourceFilter[];
  status?: ResourceStatusConfig<TRow>;
  pageSize?: number;
  /** Copy shown when the list is empty (no rows at all). */
  emptyDescription?: string;
  /** Hide the create action even when the permission is held. */
  hideCreate?: boolean;
  /** Hide the edit action. */
  hideEdit?: boolean;
  /** Initial list filter values (e.g. `{ status: "active" }`). */
  defaultFilters?: Record<string, string>;
  /** Optional billing-handoff notice rendered above the form. */
  billingHandoff?: "assign" | "renew" | "upgrade" | "freeze" | "extend";
  /** Extra notice rendered above the form fields, driven by current values. */
  formExtras?: (ctx: { values: ResourceValues; organizationId: string }) => React.ReactNode;
  /** Extra panels rendered on the detail page after the field cards. */
  detailExtras?: (row: TRow) => React.ReactNode;
  /** Label for the create button (default `Add {singular}`). */
  createLabel?: string;
  /** Extra kebab-menu items for a list row. */
  extraRowActions?: (row: TRow) => DropdownItem[];
}
