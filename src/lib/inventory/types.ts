/**
 * Phase 7 (POS, purchases, stock) domain types and labels.
 *
 * Values mirror the write-path RPCs in
 * `supabase/migrations/20261013000030_pos_inventory_purchases.sql`. Payment
 * methods are the subset accepted by `create_pos_sale`.
 */

export const POS_PAYMENT_METHODS = [
  "cash",
  "card",
  "upi",
  "netbanking",
  "wallet",
  "other",
] as const;

export type PosPaymentMethod = (typeof POS_PAYMENT_METHODS)[number];

export const POS_PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  card: "Card",
  upi: "UPI",
  netbanking: "Net banking",
  wallet: "Wallet",
  other: "Other",
};

export const PURCHASE_STATUSES = [
  "draft",
  "ordered",
  "received",
  "cancelled",
] as const;

export type PurchaseStatus = (typeof PURCHASE_STATUSES)[number];

export const PURCHASE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  ordered: "Ordered",
  received: "Received",
  cancelled: "Cancelled",
};

export const PURCHASE_STATUS_TONES: Record<
  string,
  "neutral" | "info" | "success" | "warning" | "danger"
> = {
  draft: "neutral",
  ordered: "info",
  received: "success",
  cancelled: "danger",
};

export const STOCK_MOVEMENT_TYPES = [
  "purchase",
  "sale",
  "adjustment",
  "return",
  "consumption",
  "transfer",
] as const;

export type StockMovementType = (typeof STOCK_MOVEMENT_TYPES)[number];

export const STOCK_MOVEMENT_TYPE_LABELS: Record<string, string> = {
  purchase: "Purchase",
  sale: "Sale",
  adjustment: "Adjustment",
  return: "Return",
  consumption: "Consumption",
  transfer: "Transfer",
};

export const POS_TAX_MODES = ["exclusive", "inclusive"] as const;
export type PosTaxMode = (typeof POS_TAX_MODES)[number];

export interface PosSaleItemRow {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  lineTotal: number;
}

export interface PosSaleRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string | null;
  memberName: string | null;
  saleNumber: string;
  status: string;
  subTotal: number;
  discount: number;
  taxTotal: number;
  total: number;
  paymentMethod: string;
  soldAt: string;
  notes: string | null;
  items?: PosSaleItemRow[];
}

export interface PurchaseItemRow {
  id: string;
  productId: string | null;
  description: string;
  quantity: number;
  unitCost: number;
  lineTotal: number;
}

export interface PurchaseRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  supplierId: string | null;
  supplierName: string | null;
  purchaseNumber: string;
  status: string;
  orderDate: string;
  receivedDate: string | null;
  subTotal: number;
  taxTotal: number;
  total: number;
  notes: string | null;
  items?: PurchaseItemRow[];
}

export interface StockMovementRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  productId: string;
  productName: string;
  sku: string | null;
  unit: string;
  movementType: string;
  quantity: number;
  referenceType: string | null;
  referenceId: string | null;
  notes: string | null;
  createdAt: string;
}

export interface StockOverviewRow {
  productId: string;
  name: string;
  sku: string | null;
  category: string | null;
  unit: string;
  trackStock: boolean;
  stockQuantity: number;
  reorderLevel: number;
  costPrice: number;
  salePrice: number;
  stockValue: number;
  isLow: boolean;
}
