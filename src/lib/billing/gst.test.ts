import { describe, expect, it } from "vitest";
import {
  calculateInvoiceTotals,
  calculateLineGst,
  invoiceBalance,
  resolveSupplyKind,
  roundMoney,
  splitGstRate,
} from "@/lib/billing/gst";
import { splitInstallments } from "@/lib/billing/installments";

describe("GST calculation", () => {
  it("splits intra-state GST into CGST and SGST", () => {
    expect(splitGstRate(18, "intra")).toEqual({ cgstRate: 9, sgstRate: 9, igstRate: 0 });
    expect(splitGstRate(18, "inter")).toEqual({ cgstRate: 0, sgstRate: 0, igstRate: 18 });
  });

  it("treats matching seller and place of supply as intra-state", () => {
    expect(resolveSupplyKind("Karnataka", "Karnataka")).toBe("intra");
    expect(resolveSupplyKind("Karnataka", "Maharashtra")).toBe("inter");
    expect(resolveSupplyKind(null, "Karnataka")).toBe("intra");
  });

  it("calculates exclusive tax lines", () => {
    const line = calculateLineGst({
      quantity: 1,
      unitPrice: 1000,
      discount: 0,
      taxRate: 18,
      taxMode: "exclusive",
      supply: "intra",
    });
    expect(line.taxableAmount).toBe(1000);
    expect(line.cgst).toBe(90);
    expect(line.sgst).toBe(90);
    expect(line.igst).toBe(0);
    expect(line.lineTotal).toBe(1180);
  });

  it("calculates inclusive tax lines", () => {
    const line = calculateLineGst({
      quantity: 1,
      unitPrice: 1180,
      taxRate: 18,
      taxMode: "inclusive",
      supply: "intra",
    });
    expect(line.taxableAmount).toBe(1000);
    expect(line.gstAmount).toBe(180);
    expect(line.lineTotal).toBe(1180);
  });

  it("uses IGST for inter-state supply", () => {
    const line = calculateLineGst({
      quantity: 2,
      unitPrice: 500,
      taxRate: 18,
      taxMode: "exclusive",
      supply: "inter",
    });
    expect(line.igst).toBe(180);
    expect(line.cgst).toBe(0);
    expect(line.sgst).toBe(0);
    expect(line.lineTotal).toBe(1180);
  });

  it("sums invoice totals and balance", () => {
    const line = calculateLineGst({
      quantity: 1,
      unitPrice: 1000,
      taxRate: 18,
      taxMode: "exclusive",
      supply: "intra",
    });
    const totals = calculateInvoiceTotals([line], 0);
    expect(totals.grandTotal).toBe(1180);
    expect(totals.taxTotal).toBe(180);
    expect(invoiceBalance(totals.grandTotal, 180)).toBe(1000);
  });
});

describe("installment split", () => {
  it("puts remainder on the last installment", () => {
    const items = splitInstallments(1000, 3, "2026-09-24");
    expect(items).toHaveLength(3);
    expect(roundMoney(items.reduce((sum, item) => sum + item.amount, 0))).toBe(1000);
    expect(items[0].dueDate).toBe("2026-09-24");
    expect(items[2].amount).toBe(roundMoney(1000 - items[0].amount - items[1].amount));
  });

  it("returns a single full payment when count is 1", () => {
    expect(splitInstallments(499.5, 1, "2026-01-01")).toEqual([
      { sortOrder: 0, dueDate: "2026-01-01", amount: 499.5 },
    ]);
  });

  it("splits remaining invoice balance exactly, last installment absorbs paise", () => {
    const remaining = invoiceBalance(15748.95, 5000);
    expect(remaining).toBe(10748.95);
    const items = splitInstallments(remaining, 3, "2026-10-04");
    expect(items).toHaveLength(3);
    expect(items.map((item) => item.amount)).toEqual([3582.98, 3582.98, 3582.99]);
    expect(roundMoney(items.reduce((sum, item) => sum + item.amount, 0))).toBe(10748.95);
    expect(items[2].dueDate).toBe("2026-12-04");
  });
});
