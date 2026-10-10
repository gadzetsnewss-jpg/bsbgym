import type { AppOrganization } from "@/lib/auth/types";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";
import {
  PAPER_PROFILES,
  PRODUCT_FOOTER,
  effectivePrintTemplate,
  isThermalPaper,
  parseInvoiceSettings,
  parsePrintSettings,
  resolvedPaper,
  type InvoiceSettings,
  type PrintSettings,
} from "@/lib/org/settings-catalog";

export type DocumentKind =
  | "invoice"
  | "payment_receipt"
  | "credit_note"
  | "refund_receipt"
  | "membership_receipt"
  | "pos_receipt";

export interface DocumentParty {
  name: string;
  legalName?: string | null;
  logoUrl?: string | null;
  address?: string | null;
  gstin?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
}

export interface DocumentLine {
  description: string;
  detail?: string | null;
  hsnSac?: string | null;
  quantity?: number | null;
  rate?: number | null;
  discount?: number | null;
  taxRate?: number | null;
  total: number;
}

export interface DocumentTotals {
  subTotal: number;
  discount: number;
  cgst: number;
  sgst: number;
  igst: number;
  roundOff: number;
  total: number;
  paid?: number;
  balance?: number;
}

export interface DocumentPayment {
  method: string;
  amount: number;
  reference?: string | null;
}

export interface DocumentModel {
  kind: DocumentKind;
  title: string;
  number: string;
  status?: string | null;
  issueDate?: string | null;
  dueDate?: string | null;
  placeOfSupply?: string | null;
  branchName?: string | null;
  notes?: string | null;
  terms?: string | null;
  seller: DocumentParty;
  buyer?: DocumentParty | null;
  lines: DocumentLine[];
  totals?: DocumentTotals | null;
  payments: DocumentPayment[];
  highlightAmount?: number | null;
  highlightLabel?: string | null;
}

export interface DocumentRenderConfig {
  print: PrintSettings;
  invoice: InvoiceSettings;
}

export function orgAddress(org: AppOrganization | null | undefined): string {
  return [
    org?.addressLine1,
    org?.addressLine2,
    org?.city,
    org?.state,
    org?.postalCode,
  ]
    .filter(Boolean)
    .join(", ");
}

export function sellerFromOrganization(org: AppOrganization | null | undefined): DocumentParty {
  return {
    name: org?.name ?? "Gym",
    legalName: org?.legalName,
    logoUrl: org?.logoUrl,
    address: orgAddress(org),
    gstin: org?.gstin,
    phone: org?.phone,
    email: org?.email,
    website: org?.website,
  };
}

export function invoiceDocument(
  invoice: InvoiceRow,
  seller: DocumentParty,
  payments: PaymentRow[],
  invoiceSettings: InvoiceSettings,
): DocumentModel {
  return {
    kind: "invoice",
    title: "TAX INVOICE",
    number: invoice.invoiceNumber,
    status: invoice.status,
    issueDate: invoice.issueDate,
    dueDate: invoice.dueDate,
    placeOfSupply: invoice.placeOfSupply,
    branchName: invoice.branchName,
    notes: invoice.notes,
    terms: invoiceSettings.terms || invoiceSettings.footerNote || null,
    seller,
    buyer: {
      name: invoice.memberName,
      legalName: invoice.memberCode,
      phone: invoice.memberPhone,
      email: invoice.memberEmail,
      address: invoice.memberAddress,
    },
    lines: (invoice.items ?? []).map((item) => ({
      description: item.description,
      detail: item.planName,
      hsnSac: item.hsnSac,
      quantity: item.quantity,
      rate: item.unitPrice,
      discount: item.discount,
      taxRate: item.taxRate,
      total: item.lineTotal,
    })),
    totals: {
      subTotal: invoice.subTotal,
      discount: invoice.discount,
      cgst: invoice.cgst,
      sgst: invoice.sgst,
      igst: invoice.igst,
      roundOff: invoice.roundOff,
      total: invoice.total,
      paid: invoice.amountPaid,
      balance: invoice.balance,
    },
    payments: payments.map((row) => ({
      method: row.method,
      amount: row.amount,
      reference: row.reference,
    })),
  };
}

export function paymentReceiptDocument(payment: PaymentRow, seller: DocumentParty): DocumentModel {
  return {
    kind: "payment_receipt",
    title: "PAYMENT RECEIPT",
    number: payment.invoiceNumber ?? payment.id.slice(0, 8),
    issueDate: payment.paidAt,
    notes: payment.notes,
    seller,
    buyer: { name: payment.memberName },
    lines: [],
    payments: [{ method: payment.method, amount: payment.amount, reference: payment.reference }],
    highlightAmount: payment.amount,
    highlightLabel: "Amount received",
  };
}

export function pageCssSize(print: PrintSettings): string {
  const paper = resolvedPaper(print);
  if (paper.continuous) return `${paper.widthMm}mm auto`;
  if (print.paperSize === "custom") {
    return print.orientation === "landscape"
      ? `${paper.heightMm}mm ${paper.widthMm}mm`
      : `${paper.widthMm}mm ${paper.heightMm}mm`;
  }
  const named = print.paperSize === "thermal_58" || print.paperSize === "thermal_80" ? "A4" : print.paperSize;
  const label =
    named === "a4"
      ? "A4"
      : named === "a5"
        ? "A5"
        : named === "letter"
          ? "letter"
          : named === "legal"
            ? "legal"
            : named === "ledger"
              ? "ledger"
              : "A4";
  return `${label} ${print.orientation}`;
}

export function documentPageStyle(print: PrintSettings): Record<string, string | number | undefined> {
  const paper = resolvedPaper(print);
  const width = `${paper.widthMm}mm`;
  const thermal = isThermalPaper(print.paperSize) || paper.continuous;
  return {
    width,
    maxWidth: "100%",
    minHeight: thermal || paper.heightMm <= 0 ? undefined : `${paper.heightMm}mm`,
    paddingTop: `${print.marginTopMm}mm`,
    paddingRight: `${print.marginRightMm}mm`,
    paddingBottom: `${print.marginBottomMm}mm`,
    paddingLeft: `${print.marginLeftMm}mm`,
    fontSize: `${print.fontSize}px`,
    lineHeight: print.lineSpacing,
    transform: print.scale === 100 ? undefined : `scale(${print.scale / 100})`,
    transformOrigin: "top left",
  };
}

export function documentFooterText(print: PrintSettings, invoice: InvoiceSettings): string | null {
  const gym = print.footerText.trim() || invoice.footerNote.trim();
  return gym || null;
}

export function productFooterVisible(print: PrintSettings): boolean {
  return print.fields.productFooter;
}

export function productFooterLabel(): string {
  return PRODUCT_FOOTER;
}

export function parseDocumentConfig(
  invoiceValue: unknown,
  printValue: unknown,
): DocumentRenderConfig {
  return {
    invoice: parseInvoiceSettings(invoiceValue as never),
    print: parsePrintSettings(printValue as never),
  };
}

export function previewSampleDocument(seller: DocumentParty): DocumentModel {
  return {
    kind: "invoice",
    title: "TAX INVOICE",
    number: "INV-0001",
    status: "issued",
    issueDate: "2026-10-08",
    dueDate: "2026-10-15",
    placeOfSupply: seller.address?.split(", ").at(-1) ?? "—",
    branchName: "Main",
    notes: "Sample preview. Saved print settings apply to real invoices.",
    terms: "Payment due within the configured terms.",
    seller,
    buyer: {
      name: "Sample Member",
      legalName: "MEM-001",
      phone: "9999999999",
      email: "member@example.com",
      address: "Member address line",
    },
    lines: [
      {
        description: "Gold membership",
        detail: "12 months",
        hsnSac: "9997",
        quantity: 1,
        rate: 10000,
        discount: 0,
        taxRate: 18,
        total: 11800,
      },
    ],
    totals: {
      subTotal: 10000,
      discount: 0,
      cgst: 900,
      sgst: 900,
      igst: 0,
      roundOff: 0,
      total: 11800,
      paid: 11800,
      balance: 0,
    },
    payments: [{ method: "upi", amount: 11800, reference: "UPI123" }],
  };
}

export { PAPER_PROFILES, effectivePrintTemplate };
