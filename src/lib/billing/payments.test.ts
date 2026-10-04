import { describe, expect, it } from "vitest";
import { collectPaymentRows, paymentRowsTotal } from "@/lib/billing/payments";

describe("split payment rows", () => {
  it("persists every row, not only the first", () => {
    const rows = collectPaymentRows([
      { method: "cash", amount: "5000", reference: "CASH-1" },
      { method: "upi", amount: "10748.95", reference: "UPI-2" },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toEqual({ method: "cash", amount: 5000, reference: "CASH-1" });
    expect(rows[1]).toEqual({ method: "upi", amount: 10748.95, reference: "UPI-2" });
    expect(paymentRowsTotal(rows)).toBe(15748.95);
  });

  it("sums a partial two-way split", () => {
    const rows = collectPaymentRows([
      { method: "cash", amount: 5000, reference: "" },
      { method: "upi", amount: 5000, reference: "" },
    ]);
    expect(paymentRowsTotal(rows)).toBe(10000);
  });

  it("keeps a 3-way split with distinct methods and references", () => {
    const rows = collectPaymentRows([
      { method: "cash", amount: "5000", reference: "CASH" },
      { method: "upi", amount: "10000", reference: "UPI" },
      { method: "card", amount: "748.95", reference: "CARD" },
    ]);
    expect(rows.map((row) => row.method)).toEqual(["cash", "upi", "card"]);
    expect(paymentRowsTotal(rows)).toBe(15748.95);
  });
});
