/**
 * Phase 7 inventory client (POS, purchases, stock).
 *
 * Reads use RLS-scoped selects. Writes go through the SECURITY DEFINER RPCs in
 * `supabase/migrations/20261013000030_pos_inventory_purchases.sql`;
 * `organization_id` is derived server-side and never trusted from the client.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import { roundMoney } from "@/lib/billing/gst";
import type { OrgResult } from "@/lib/org/members";
import type { ProductRow } from "@/lib/catalog/adapters";
import type { SelectOption } from "@/components/ui/select";
import type {
  PosSaleItemRow,
  PosSaleRow,
  PurchaseItemRow,
  PurchaseRow,
  StockMovementRow,
  StockOverviewRow,
} from "@/lib/inventory/types";

type Row = Record<string, unknown>;
type AnyTable = "products";
type AnyFunction = "create_product";

function clientOrNull() {
  return getSupabaseBrowserClient();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function embed(value: unknown): Row | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Row | null;
}

function branchName(value: unknown): string {
  const record = embed(value);
  if (!record) return "Branch";
  if (record.name && record.code) return `${asString(record.name)} (${asString(record.code)})`;
  return asString(record.name) || "Branch";
}

function memberName(value: unknown): string | null {
  const record = embed(value);
  if (!record) return null;
  if (record.full_name) return asString(record.full_name);
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  return joined || asString(record.code) || null;
}

/* ---------------------------------------------------------------------------
   RPC helpers (mirror the billing client).
   --------------------------------------------------------------------------- */

async function rpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<OrgResult<{ id: string }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await (
    supabase.rpc as unknown as (
      name: AnyFunction,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  )(fn as AnyFunction, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

async function rpcVoid(fn: string, args: Record<string, unknown>): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { error } = await (
    supabase.rpc as unknown as (
      name: AnyFunction,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  )(fn as AnyFunction, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

/* ---------------------------------------------------------------------------
   Purchases
   --------------------------------------------------------------------------- */

const PURCHASE_SELECT =
  "id, organization_id, branch_id, supplier_id, purchase_number, status, order_date, received_date, sub_total, tax_total, total, notes, created_at, branches(id, name, code), suppliers(id, name)";

const PURCHASE_ITEM_SELECT =
  "id, product_id, description, quantity, unit_cost, line_total";

function mapPurchase(row: Row): PurchaseRow {
  const supplier = embed(row.suppliers);
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: branchName(row.branches),
    supplierId: asNullableString(row.supplier_id),
    supplierName: supplier ? asString(supplier.name) || null : null,
    purchaseNumber: asString(row.purchase_number),
    status: asString(row.status) || "draft",
    orderDate: asString(row.order_date),
    receivedDate: asNullableString(row.received_date),
    subTotal: asNumber(row.sub_total),
    taxTotal: asNumber(row.tax_total),
    total: asNumber(row.total),
    notes: asNullableString(row.notes),
  };
}

function mapPurchaseItem(row: Row): PurchaseItemRow {
  return {
    id: asString(row.id),
    productId: asNullableString(row.product_id),
    description: asString(row.description),
    quantity: asNumber(row.quantity),
    unitCost: asNumber(row.unit_cost),
    lineTotal: asNumber(row.line_total),
  };
}

export interface PurchaseListFilters {
  organizationId: string;
  search?: string;
  status?: string;
  supplierId?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchPurchases(
  filters: PurchaseListFilters,
): Promise<OrgResult<{ rows: PurchaseRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("purchases" as AnyTable)
    .select(PURCHASE_SELECT, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("order_date" as "created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") query = query.eq("status" as "id", filters.status);
  if (filters.supplierId) query = query.eq("supplier_id" as "id", filters.supplierId);
  if (filters.branchId && filters.branchId !== "all") query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.from) query = query.gte("order_date" as "created_at", filters.from);
  if (filters.to) query = query.lte("order_date" as "created_at", filters.to);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`purchase_number.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapPurchase), total: count ?? 0 },
    error: null,
  };
}

export async function fetchPurchase(
  organizationId: string,
  purchaseId: string,
): Promise<OrgResult<PurchaseRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("purchases" as AnyTable)
    .select(PURCHASE_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", purchaseId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That purchase could not be found." } };

  const { data: items } = await supabase
    .from("purchase_items" as AnyTable)
    .select(PURCHASE_ITEM_SELECT)
    .eq("purchase_id" as "id", purchaseId)
    .order("created_at" as "id", { ascending: true });

  return {
    data: {
      ...mapPurchase(data as unknown as Row),
      items: ((items ?? []) as unknown as Row[]).map(mapPurchaseItem),
    },
    error: null,
  };
}

export interface PurchaseLineInput {
  productId: string;
  description?: string | null;
  quantity: number;
  unitCost: number;
}

export async function createPurchase(input: {
  organizationId: string;
  branchId: string;
  supplierId: string;
  orderDate?: string | null;
  notes?: string | null;
  items: PurchaseLineInput[];
}): Promise<OrgResult<{ id: string }>> {
  return rpc("create_purchase", {
    p_org_id: input.organizationId,
    p_branch_id: input.branchId,
    p_supplier_id: input.supplierId,
    p_order_date: input.orderDate ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_cost: roundMoney(item.unitCost),
    })),
  });
}

export async function updatePurchase(input: {
  purchaseId: string;
  supplierId: string;
  orderDate?: string | null;
  notes?: string | null;
  items: PurchaseLineInput[];
}): Promise<OrgResult> {
  return rpcVoid("update_purchase", {
    p_purchase_id: input.purchaseId,
    p_supplier_id: input.supplierId,
    p_order_date: input.orderDate ?? null,
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_cost: roundMoney(item.unitCost),
    })),
  });
}

export async function receivePurchase(purchaseId: string): Promise<OrgResult> {
  return rpcVoid("receive_purchase", { p_purchase_id: purchaseId });
}

export async function cancelPurchase(purchaseId: string): Promise<OrgResult> {
  return rpcVoid("cancel_purchase", { p_purchase_id: purchaseId });
}

/* ---------------------------------------------------------------------------
   POS sales
   --------------------------------------------------------------------------- */

const SALE_SELECT =
  "id, organization_id, branch_id, member_id, sale_number, status, sub_total, discount, tax_total, total, payment_method, sold_at, notes, branches(id, name, code), gym_members(id, full_name, first_name, last_name, code)";

const SALE_ITEM_SELECT =
  "id, product_id, description, quantity, unit_price, tax_rate, line_total";

function mapSale(row: Row): PosSaleRow {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: branchName(row.branches),
    memberId: asNullableString(row.member_id),
    memberName: memberName(row.gym_members),
    saleNumber: asString(row.sale_number),
    status: asString(row.status) || "completed",
    subTotal: asNumber(row.sub_total),
    discount: asNumber(row.discount),
    taxTotal: asNumber(row.tax_total),
    total: asNumber(row.total),
    paymentMethod: asString(row.payment_method) || "cash",
    soldAt: asString(row.sold_at),
    notes: asNullableString(row.notes),
  };
}

function mapSaleItem(row: Row): PosSaleItemRow {
  return {
    id: asString(row.id),
    productId: asNullableString(row.product_id),
    description: asString(row.description),
    quantity: asNumber(row.quantity),
    unitPrice: asNumber(row.unit_price),
    taxRate: asNumber(row.tax_rate),
    lineTotal: asNumber(row.line_total),
  };
}

export interface PosSaleListFilters {
  organizationId: string;
  search?: string;
  status?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchPosSales(
  filters: PosSaleListFilters,
): Promise<OrgResult<{ rows: PosSaleRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("pos_sales" as AnyTable)
    .select(SALE_SELECT, { count: "exact" })
    .eq("organization_id", filters.organizationId)
    .order("sold_at" as "created_at", { ascending: false })
    .range(from, to);

  if (filters.status && filters.status !== "all") query = query.eq("status" as "id", filters.status);
  if (filters.branchId && filters.branchId !== "all") query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.from) query = query.gte("sold_at" as "created_at", filters.from);
  if (filters.to) query = query.lte("sold_at" as "created_at", `${filters.to}T23:59:59`);
  const search = filters.search?.trim();
  if (search) {
    const escaped = search.replace(/[%_,]/g, " ");
    query = query.or(`sale_number.ilike.%${escaped}%,notes.ilike.%${escaped}%`);
  }

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: { rows: ((data ?? []) as unknown as Row[]).map(mapSale), total: count ?? 0 },
    error: null,
  };
}

export async function fetchPosSale(
  organizationId: string,
  saleId: string,
): Promise<OrgResult<PosSaleRow>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("pos_sales" as AnyTable)
    .select(SALE_SELECT)
    .eq("organization_id", organizationId)
    .eq("id", saleId)
    .maybeSingle();
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (!data) return { data: null, error: { message: "That sale could not be found." } };

  const { data: items } = await supabase
    .from("pos_sale_items" as AnyTable)
    .select(SALE_ITEM_SELECT)
    .eq("sale_id" as "id", saleId)
    .order("created_at" as "id", { ascending: true });

  return {
    data: {
      ...mapSale(data as unknown as Row),
      items: ((items ?? []) as unknown as Row[]).map(mapSaleItem),
    },
    error: null,
  };
}

export interface PosSaleLineInput {
  productId: string;
  quantity: number;
}

export async function createPosSale(input: {
  organizationId: string;
  branchId: string;
  memberId?: string | null;
  paymentMethod: string;
  discount?: number;
  taxMode?: string | null;
  notes?: string | null;
  items: PosSaleLineInput[];
}): Promise<OrgResult<{ id: string }>> {
  return rpc("create_pos_sale", {
    p_org_id: input.organizationId,
    p_branch_id: input.branchId,
    p_member_id: input.memberId ?? null,
    p_payment_method: input.paymentMethod,
    p_discount: roundMoney(input.discount ?? 0),
    p_tax_mode: input.taxMode ?? "exclusive",
    p_notes: input.notes ?? null,
    p_items: input.items.map((item) => ({
      product_id: item.productId,
      quantity: item.quantity,
    })),
  });
}

export async function voidPosSale(saleId: string): Promise<OrgResult> {
  return rpcVoid("void_pos_sale", { p_sale_id: saleId });
}

/* ---------------------------------------------------------------------------
   Stock
   --------------------------------------------------------------------------- */

export async function fetchStockOverview(
  organizationId: string,
): Promise<OrgResult<StockOverviewRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("products" as AnyTable)
    .select(
      "id, name, sku, category, unit, track_stock, stock_quantity, reorder_level, cost_price, sale_price",
    )
    .eq("organization_id", organizationId)
    .order("name" as "id", { ascending: true });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row): StockOverviewRow => {
      const stockQuantity = asNumber(row.stock_quantity);
      const reorderLevel = asNumber(row.reorder_level);
      const trackStock = asBoolean(row.track_stock);
      return {
        productId: asString(row.id),
        name: asString(row.name),
        sku: asNullableString(row.sku),
        category: asNullableString(row.category),
        unit: asString(row.unit) || "pcs",
        trackStock,
        stockQuantity,
        reorderLevel,
        costPrice: asNumber(row.cost_price),
        salePrice: asNumber(row.sale_price),
        stockValue: roundMoney(stockQuantity * asNumber(row.cost_price)),
        isLow: trackStock && stockQuantity <= reorderLevel,
      };
    }),
    error: null,
  };
}

/** Active products with full pricing, for POS and purchase line pickers. */
export async function loadPosProducts(organizationId: string): Promise<ProductRow[]> {
  const supabase = clientOrNull();
  if (!supabase) return [];
  const { data } = await supabase
    .from("products" as AnyTable)
    .select(
      "id, organization_id, name, sku, description, category, unit, cost_price, sale_price, tax_rate, track_stock, stock_quantity, reorder_level, is_active",
    )
    .eq("organization_id", organizationId)
    .eq("is_active" as "id", true as unknown as string)
    .order("name" as "id", { ascending: true });
  return ((data ?? []) as unknown as Row[]).map((row): ProductRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    sku: asNullableString(row.sku),
    description: asNullableString(row.description),
    category: asNullableString(row.category),
    unit: asString(row.unit) || "pcs",
    costPrice: asNumber(row.cost_price),
    salePrice: asNumber(row.sale_price),
    taxRate: asNumber(row.tax_rate),
    trackStock: asBoolean(row.track_stock),
    stockQuantity: asNumber(row.stock_quantity),
    reorderLevel: asNumber(row.reorder_level),
    isActive: asBoolean(row.is_active),
  }));
}

export async function loadSupplierOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = clientOrNull();
  if (!supabase) return [];
  const { data } = await supabase
    .from("suppliers" as AnyTable)
    .select("id, name, is_active")
    .eq("organization_id", organizationId)
    .eq("is_active" as "id", true as unknown as string)
    .order("name" as "id", { ascending: true });
  return ((data ?? []) as unknown as Row[]).map((row) => ({
    value: asString(row.id),
    label: asString(row.name),
  }));
}

export interface StockFlowSummary {
  stockIn: number;
  stockOut: number;
  movementCount: number;
}

/**
 * Aggregate stock-in / stock-out over recent movements. Bounded to the most
 * recent `limit` movements so the client never scans the whole table.
 */
export async function fetchStockFlow(
  organizationId: string,
  options: { days?: number; limit?: number; branchId?: string } = {},
): Promise<OrgResult<StockFlowSummary>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const limit = Math.min(2000, Math.max(1, options.limit ?? 1000));
  const fromDate = new Date();
  fromDate.setDate(fromDate.getDate() - (options.days ?? 30));

  let query = supabase
    .from("stock_movements" as AnyTable)
    .select("quantity, movement_type")
    .eq("organization_id", organizationId)
    .gte("created_at" as "id", fromDate.toISOString())
    .order("created_at" as "id", { ascending: false })
    .limit(limit);
  if (options.branchId && options.branchId !== "all") {
    query = query.eq("branch_id" as "id", options.branchId);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  let stockIn = 0;
  let stockOut = 0;
  ((data ?? []) as unknown as Row[]).forEach((row) => {
    const quantity = asNumber(row.quantity);
    if (quantity >= 0) stockIn += quantity;
    else stockOut += Math.abs(quantity);
  });
  return { data: { stockIn, stockOut, movementCount: (data ?? []).length }, error: null };
}

export interface StockMovementListFilters {
  organizationId: string;
  productId?: string;
  movementType?: string;
  branchId?: string;
  from?: string;
  to?: string;
  page?: number;
  pageSize?: number;
}

export async function fetchStockMovements(
  filters: StockMovementListFilters,
): Promise<OrgResult<{ rows: StockMovementRow[]; total: number }>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 50));
  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;

  let query = supabase
    .from("stock_movements" as AnyTable)
    .select(
      "id, organization_id, branch_id, product_id, movement_type, quantity, reference_type, reference_id, notes, created_at, branches(id, name, code), products(id, name, sku, unit)",
      { count: "exact" },
    )
    .eq("organization_id", filters.organizationId)
    .order("created_at" as "id", { ascending: false })
    .range(from, to);

  if (filters.productId) query = query.eq("product_id" as "id", filters.productId);
  if (filters.movementType && filters.movementType !== "all")
    query = query.eq("movement_type" as "id", filters.movementType);
  if (filters.branchId && filters.branchId !== "all")
    query = query.eq("branch_id" as "id", filters.branchId);
  if (filters.from) query = query.gte("created_at" as "id", filters.from);
  if (filters.to) query = query.lte("created_at" as "id", `${filters.to}T23:59:59`);

  const { data, error, count } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: {
      rows: ((data ?? []) as unknown as Row[]).map((row): StockMovementRow => {
        const product = embed(row.products);
        return {
          id: asString(row.id),
          organizationId: asString(row.organization_id),
          branchId: asString(row.branch_id),
          branchName: branchName(row.branches),
          productId: asString(row.product_id),
          productName: product ? asString(product.name) || "Product" : "Product",
          sku: product ? asNullableString(product.sku) : null,
          unit: product ? asString(product.unit) || "pcs" : "pcs",
          movementType: asString(row.movement_type),
          quantity: asNumber(row.quantity),
          referenceType: asNullableString(row.reference_type),
          referenceId: asNullableString(row.reference_id),
          notes: asNullableString(row.notes),
          createdAt: asString(row.created_at),
        };
      }),
      total: count ?? 0,
    },
    error: null,
  };
}
