export const INVOICE_STATUSES = [
  "draft",
  "issued",
  "partially_paid",
  "paid",
  "overdue",
  "void",
] as const;

export const INVOICE_ITEM_TYPES = [
  "membership",
  "renewal",
  "upgrade",
  "personal_training",
  "class",
  "product",
  "other",
] as const;

export const PAYMENT_METHODS = [
  "cash",
  "upi",
  "card",
  "netbanking",
  "wallet",
  "cheque",
  "bank_transfer",
  "other",
] as const;

export const CREDIT_NOTE_REASONS = [
  "cancellation",
  "overcharge",
  "discount_adjustment",
  "service_issue",
  "other",
] as const;

export const REFUND_METHODS = ["cash", "upi", "card", "bank_transfer", "original"] as const;

export const REFUND_STATUSES = ["requested", "approved", "processed", "rejected"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export type InvoiceItemType = (typeof INVOICE_ITEM_TYPES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type CreditNoteReason = (typeof CREDIT_NOTE_REASONS)[number];
export type RefundMethod = (typeof REFUND_METHODS)[number];
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const INVOICE_ITEM_TYPE_LABELS: Record<InvoiceItemType, string> = {
  membership: "Membership",
  renewal: "Renewal",
  upgrade: "Upgrade",
  personal_training: "Personal Training",
  class: "Class",
  product: "Product",
  other: "Other",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "Cash",
  upi: "UPI",
  card: "Card",
  bank_transfer: "Bank Transfer",
  netbanking: "Net banking",
  wallet: "Wallet",
  cheque: "Cheque",
  other: "Other",
  original: "Original method",
};

export const INVOICE_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  partially_paid: "Partially Paid",
  paid: "Paid",
  overdue: "Overdue",
  void: "Cancelled",
};

export const CREDIT_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  issued: "Issued",
  applied: "Applied",
  void: "Cancelled",
};

export const REFUND_STATUS_LABELS: Record<string, string> = {
  requested: "Requested",
  approved: "Approved",
  processed: "Completed",
  rejected: "Cancelled",
};

export const CREDIT_REASON_LABELS: Record<string, string> = {
  cancellation: "Cancellation",
  overcharge: "Overcharge",
  discount_adjustment: "Discount Adjustment",
  service_issue: "Service Issue",
  other: "Other",
};

export interface InvoiceItemRow {
  id: string;
  description: string;
  itemType: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxRate: number;
  taxableAmount: number;
  gstAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  lineTotal: number;
  sortOrder: number;
  hsnSac: string | null;
  planId: string | null;
  planName: string | null;
}

export interface InvoiceRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string | null;
  memberName: string;
  memberCode: string | null;
  memberPhone: string | null;
  memberEmail: string | null;
  memberAddress: string | null;
  membershipId: string | null;
  invoiceNumber: string;
  status: string;
  issueDate: string;
  dueDate: string | null;
  subTotal: number;
  discount: number;
  taxTotal: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  amountPaid: number;
  amountCredited: number;
  balance: number;
  notes: string | null;
  placeOfSupply: string | null;
  taxMode: string;
  createdAt: string;
  items?: InvoiceItemRow[];
}

export interface PaymentRow {
  id: string;
  organizationId: string;
  branchId: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  memberId: string | null;
  memberName: string;
  amount: number;
  method: string;
  reference: string | null;
  paidAt: string;
  notes: string | null;
  collectedBy: string | null;
  status: string;
}

export interface InstallmentRow {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  memberName: string;
  dueDate: string;
  amount: number;
  paidAmount: number;
  remaining: number;
  status: string;
  sortOrder: number;
  invoiceTotal: number;
}

export interface CreditNoteRow {
  id: string;
  creditNumber: string;
  invoiceId: string | null;
  invoiceNumber: string | null;
  memberId: string | null;
  memberName: string;
  issueDate: string;
  amount: number;
  taxTotal: number;
  reason: string | null;
  notes: string | null;
  status: string;
}

export interface RefundRow {
  id: string;
  paymentId: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  memberId: string | null;
  memberName: string;
  amount: number;
  method: string;
  reason: string | null;
  notes: string | null;
  status: string;
  createdAt: string;
  processedAt: string | null;
}

export interface BillingDashboard {
  todayRevenue: number;
  monthlyRevenue: number;
  outstanding: number;
  overdue: number;
  paidCount: number;
  unpaidCount: number;
  installmentsDue: number;
  revenueTrend: { label: string; value: number }[];
  methodSummary: { method: string; amount: number }[];
  recentInvoices: InvoiceRow[];
  recentPayments: PaymentRow[];
  upcomingDues: InstallmentRow[];
}

export interface OutstandingSummary {
  total: number;
  dueToday: number;
  dueThisWeek: number;
  overdue: number;
  dueThisMonth: number;
  aging: {
    current: number;
    days1to7: number;
    days8to30: number;
    days31to60: number;
    days60plus: number;
  };
  rows: InvoiceRow[];
}
