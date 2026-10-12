import { roundMoney } from "@/lib/billing/gst";

export interface DraftPaymentRow {
  amount: string | number;
  method: string;
  reference?: string | null;
}

export interface NormalizedPaymentRow {
  amount: number;
  method: string;
  reference: string | null;
}

/** Keeps every valid split-payment row. Does not collapse to the first item. */
export function collectPaymentRows(payments: DraftPaymentRow[]): NormalizedPaymentRow[] {
  return payments
    .map((payment) => ({
      amount: roundMoney(Number(payment.amount)),
      method: payment.method,
      reference:
        typeof payment.reference === "string"
          ? payment.reference.trim() || null
          : payment.reference ?? null,
    }))
    .filter((payment) => Number.isFinite(payment.amount) && payment.amount > 0);
}

export function paymentRowsTotal(payments: Array<{ amount: number }>): number {
  return roundMoney(payments.reduce((sum, payment) => sum + payment.amount, 0));
}
