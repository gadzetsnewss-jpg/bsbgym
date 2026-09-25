/**
 * Single GST calculation utility for invoices, credit notes and POS.
 * Intra-state = CGST + SGST. Inter-state = IGST.
 */

export type TaxMode = "inclusive" | "exclusive";
export type SupplyKind = "intra" | "inter";

export const GST_RATE_OPTIONS = [
  { value: "0", label: "0%" },
  { value: "5", label: "5%" },
  { value: "12", label: "12%" },
  { value: "18", label: "18%" },
  { value: "28", label: "28%" },
] as const;

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export function splitGstRate(rate: number, supply: SupplyKind): {
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
} {
  const safe = Math.max(0, Number.isFinite(rate) ? rate : 0);
  if (supply === "inter") {
    return { cgstRate: 0, sgstRate: 0, igstRate: safe };
  }
  const half = roundMoney(safe / 2);
  return { cgstRate: half, sgstRate: roundMoney(safe - half), igstRate: 0 };
}

export function resolveSupplyKind(
  sellerState: string | null | undefined,
  placeOfSupply: string | null | undefined,
): SupplyKind {
  const seller = (sellerState ?? "").trim().toLowerCase();
  const place = (placeOfSupply ?? "").trim().toLowerCase();
  if (!seller || !place) return "intra";
  return seller === place ? "intra" : "inter";
}

export interface LineInput {
  quantity: number;
  unitPrice: number;
  discount?: number;
  taxRate: number;
  taxMode: TaxMode;
  supply: SupplyKind;
}

export interface LineGst {
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
}

export function calculateLineGst(input: LineInput): LineGst {
  const quantity = Math.max(0, Number(input.quantity) || 0);
  const unitPrice = Math.max(0, Number(input.unitPrice) || 0);
  const discount = Math.max(0, Number(input.discount) || 0);
  const taxRate = Math.max(0, Number(input.taxRate) || 0);
  const gross = roundMoney(quantity * unitPrice);
  const afterDiscount = Math.max(roundMoney(gross - discount), 0);
  const split = splitGstRate(taxRate, input.supply);

  let taxableAmount: number;
  let gstAmount: number;
  if (input.taxMode === "inclusive" && taxRate > 0) {
    taxableAmount = roundMoney(afterDiscount / (1 + taxRate / 100));
    gstAmount = roundMoney(afterDiscount - taxableAmount);
  } else {
    taxableAmount = afterDiscount;
    gstAmount = roundMoney(taxableAmount * (taxRate / 100));
  }

  const cgst = roundMoney(taxableAmount * (split.cgstRate / 100));
  const sgst = roundMoney(taxableAmount * (split.sgstRate / 100));
  const igst = roundMoney(taxableAmount * (split.igstRate / 100));
  const tax = input.supply === "inter" ? igst : roundMoney(cgst + sgst);
  const lineTotal =
    input.taxMode === "inclusive" ? afterDiscount : roundMoney(taxableAmount + tax);

  return {
    quantity,
    unitPrice,
    discount,
    taxRate,
    taxableAmount,
    gstAmount: tax,
    cgst: input.supply === "inter" ? 0 : cgst,
    sgst: input.supply === "inter" ? 0 : sgst,
    igst: input.supply === "inter" ? igst : 0,
    lineTotal,
  };
}

export interface InvoiceTotals {
  subTotal: number;
  discount: number;
  taxableAmount: number;
  cgst: number;
  sgst: number;
  igst: number;
  taxTotal: number;
  roundOff: number;
  grandTotal: number;
}

export function calculateInvoiceTotals(
  lines: readonly LineGst[],
  roundOff = 0,
): InvoiceTotals {
  const subTotal = roundMoney(lines.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0));
  const discount = roundMoney(lines.reduce((sum, line) => sum + line.discount, 0));
  const taxableAmount = roundMoney(lines.reduce((sum, line) => sum + line.taxableAmount, 0));
  const cgst = roundMoney(lines.reduce((sum, line) => sum + line.cgst, 0));
  const sgst = roundMoney(lines.reduce((sum, line) => sum + line.sgst, 0));
  const igst = roundMoney(lines.reduce((sum, line) => sum + line.igst, 0));
  const taxTotal = roundMoney(cgst + sgst + igst);
  const rounded = roundMoney(roundOff);
  const grandTotal = roundMoney(
    lines.reduce((sum, line) => sum + line.lineTotal, 0) + rounded,
  );
  return {
    subTotal,
    discount,
    taxableAmount,
    cgst,
    sgst,
    igst,
    taxTotal,
    roundOff: rounded,
    grandTotal: Math.max(grandTotal, 0),
  };
}

export function invoiceBalance(total: number, amountPaid: number, amountCredited = 0): number {
  return roundMoney(Math.max(total - amountPaid - amountCredited, 0));
}
