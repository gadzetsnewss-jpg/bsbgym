/**
 * Generic table-backed CRUD adapter (Phase 3.2).
 *
 * Reads (list/get) use RLS-scoped selects. Writes always go through SECURITY
 * DEFINER RPCs - never direct table writes - so `organization_id` is derived
 * server-side and RLS remains the security boundary.
 *
 * The adapter is intentionally thin: each resource supplies its table, column
 * list, row mapper and RPC parameter builders, and gets a `ResourceAdapter`
 * for the generic list/form/detail components.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import type {
  ResourceAdapter,
  ResourceListParams,
  ResourceValues,
} from "@/lib/crud/types";

type RpcError = { message?: string } | null;
type Row = Record<string, unknown>;

/**
 * The Supabase client is strongly typed per table/function. These aliases let
 * the generic adapter reuse that client for dynamic table names and RPCs
 * without widening the whole client to `any`.
 */
type AnyTable = "gym_members";
type AnyFunction = "create_gym_member";

export interface TableAdapterOptions<TRow> {
  table: string;
  /** PostgREST select list, including embedded relations. */
  select: string;
  /** Columns matched by the search box (ILIKE). */
  searchColumns: string[];
  /** Default ordering applied to the list query. */
  order: { column: string; ascending?: boolean };
  mapRow: (row: Row) => TRow;
  /** Maps a row back into form values (shared by edit + detail). */
  toFormValues: (row: TRow) => ResourceValues;
  /** Resource filter name -> database column. */
  filterColumns?: Record<string, string>;
  rpcCreate: string;
  rpcUpdate?: string;
  idUpdateParam?: string;
  buildCreateParams: (
    values: ResourceValues,
    organizationId: string,
  ) => Record<string, unknown>;
  buildUpdateParams?: (values: ResourceValues) => Record<string, unknown>;
  setActiveRpc?: string;
  setActiveIdParam?: string;
  setActiveValueParam?: string;
  /** Always applied on list/get besides organization_id. */
  fixedEq?: Record<string, string | boolean>;
  /** List-only: keep rows whose date column is within N days from today. */
  lteColumnDays?: { column: string; days: number };
  /** Filter name -> timestamptz column. Value `today` restricts to that UTC date. */
  dateEqFilters?: Record<string, string>;
  /** Filter name -> column that must be null when the value is `true` or `open`. */
  isNullFilters?: Record<string, string>;
}

export function createTableAdapter<TRow>(
  opts: TableAdapterOptions<TRow>,
): ResourceAdapter<TRow> {
  const errorOf = (error: unknown): { message: string } => ({
    message: friendlyMessage(error),
  });

  return {
    async list(params: ResourceListParams): Promise<OrgResult<{ rows: TRow[]; total: number }>> {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

      const from = (params.page - 1) * params.pageSize;
      const to = from + params.pageSize - 1;

      let query = supabase
        .from(opts.table as AnyTable)
        .select(opts.select, { count: "exact" })
        .eq("organization_id", params.organizationId)
        .order(opts.order.column, { ascending: opts.order.ascending ?? true })
        .range(from, to);

      const search = params.search.trim();
      if (search && opts.searchColumns.length > 0) {
        const escaped = search.replace(/[%_,]/g, " ");
        const filters = opts.searchColumns
          .map((column) => `${column}.ilike.%${escaped}%`)
          .join(",");
        query = query.or(filters);
      }

      for (const [name, column] of Object.entries(opts.filterColumns ?? {})) {
        const value = params.filters[name];
        if (value && value !== "all") {
          const coerced = value === "true" ? true : value === "false" ? false : value;
          query = query.eq(column, coerced);
        }
      }

      for (const [column, value] of Object.entries(opts.fixedEq ?? {})) {
        query = query.eq(column, value);
      }

      if (opts.lteColumnDays) {
        const limit = new Date();
        limit.setDate(limit.getDate() + opts.lteColumnDays.days);
        query = query.lte(opts.lteColumnDays.column, limit.toISOString().slice(0, 10));
      }

      for (const [name, column] of Object.entries(opts.dateEqFilters ?? {})) {
        const value = params.filters[name];
        if (value === "today") {
          const start = new Date();
          start.setUTCHours(0, 0, 0, 0);
          const end = new Date(start);
          end.setUTCDate(end.getUTCDate() + 1);
          query = query.gte(column, start.toISOString()).lt(column, end.toISOString());
        }
      }

      for (const [name, column] of Object.entries(opts.isNullFilters ?? {})) {
        const value = params.filters[name];
        if (value === "true" || value === "open") {
          query = query.is(column, null);
        }
      }

      const { data, error, count } = await query;
      if (error) return { data: null, error: errorOf(error) };
      return {
        data: {
          rows: ((data ?? []) as unknown as Row[]).map(opts.mapRow),
          total: count ?? 0,
        },
        error: null,
      };
    },

    async get(organizationId: string, id: string): Promise<OrgResult<TRow>> {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

      let query = supabase
        .from(opts.table as AnyTable)
        .select(opts.select)
        .eq("organization_id", organizationId)
        .eq("id", id);

      for (const [column, value] of Object.entries(opts.fixedEq ?? {})) {
        query = query.eq(column, value);
      }

      const { data, error } = await query.maybeSingle();

      if (error) return { data: null, error: errorOf(error) };
      if (!data) return { data: null, error: { message: "That item could not be found." } };
      return { data: opts.mapRow(data as unknown as Row), error: null };
    },

    async create(
      organizationId: string,
      values: ResourceValues,
    ): Promise<OrgResult<{ id: string }>> {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

      const { data, error } = await (supabase.rpc as unknown as (
        fn: AnyFunction,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: RpcError }>)(
        opts.rpcCreate as AnyFunction,
        { p_org_id: organizationId, ...opts.buildCreateParams(values, organizationId) },
      );
      if (error) return { data: null, error: errorOf(error) };
      return { data: { id: String(data) }, error: null };
    },

    update:
      opts.rpcUpdate && opts.idUpdateParam && opts.buildUpdateParams
        ? async (id: string, values: ResourceValues): Promise<OrgResult> => {
            const supabase = getSupabaseBrowserClient();
            if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

            const { error } = await (supabase.rpc as unknown as (
              fn: AnyFunction,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: RpcError }>)(
              opts.rpcUpdate as AnyFunction,
              { [opts.idUpdateParam as string]: id, ...opts.buildUpdateParams!(values) },
            );
            if (error) return { data: null, error: errorOf(error) };
            return { data: undefined, error: null };
          }
        : undefined,

    setActive:
      opts.setActiveRpc && opts.setActiveIdParam && opts.setActiveValueParam
        ? async (id: string, active: boolean): Promise<OrgResult> => {
            const supabase = getSupabaseBrowserClient();
            if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

            const { error } = await (supabase.rpc as unknown as (
              fn: AnyFunction,
              args: Record<string, unknown>,
            ) => Promise<{ data: unknown; error: RpcError }>)(
              opts.setActiveRpc as AnyFunction,
              { [opts.setActiveIdParam as string]: id, [opts.setActiveValueParam as string]: active },
            );
            if (error) return { data: null, error: errorOf(error) };
            return { data: undefined, error: null };
          }
        : undefined,

    toFormValues: opts.toFormValues,
  };
}

/** Reads a text field from form values, returning null when blank. */
export function textOrNull(value: ResourceValues[string] | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

/** Reads a numeric field from form values, returning null when blank. */
export function numberOrNull(value: ResourceValues[string] | undefined): number | null {
  if (typeof value === "boolean") return null;
  const trimmed = String(value ?? "").trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

/** Reads a checkbox field, defaulting to false. */
export function booleanValue(value: ResourceValues[string] | undefined): boolean {
  return value === true;
}

/** Reads a datetime-local field as an ISO-like timestamp, or null when blank. */
export function datetimeOrNull(value: ResourceValues[string] | undefined): string | null {
  const text = textOrNull(value);
  if (!text) return null;
  return text.length === 16 ? `${text}:00` : text;
}

/** Maps a timestamptz / ISO string to a datetime-local input value. */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value.length >= 16 ? value.slice(0, 16) : value;
  }
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
