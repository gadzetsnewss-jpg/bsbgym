import { roundMoney } from "@/lib/billing/gst";

export const INSTALLMENT_PRESETS = [
  { value: "1", label: "Full payment" },
  { value: "3", label: "3 installments" },
  { value: "4", label: "4 installments" },
  { value: "5", label: "5 installments" },
  { value: "custom", label: "Custom" },
] as const;

export interface InstallmentPlanItem {
  sortOrder: number;
  dueDate: string;
  amount: number;
}

function addMonths(isoDate: string, months: number): string {
  const parts = isoDate.split("-").map(Number);
  if (parts.length !== 3 || parts.some((p) => Number.isNaN(p))) return isoDate;
  const [y, m, d] = parts;
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Splits remaining balance into `count` installments. Last row absorbs paise remainder. */
export function splitInstallments(
  total: number,
  count: number,
  startDate: string,
): InstallmentPlanItem[] {
  const safeCount = Math.max(1, Math.floor(count));
  const safeTotal = roundMoney(Math.max(total, 0));
  if (safeCount === 1) {
    return [{ sortOrder: 0, dueDate: startDate, amount: safeTotal }];
  }
  const base = roundMoney(Math.floor((safeTotal / safeCount) * 100) / 100);
  const items: InstallmentPlanItem[] = [];
  let allocated = 0;
  for (let index = 0; index < safeCount; index += 1) {
    const isLast = index === safeCount - 1;
    const amount = isLast ? roundMoney(safeTotal - allocated) : base;
    allocated = roundMoney(allocated + amount);
    items.push({
      sortOrder: index,
      dueDate: addMonths(startDate, index),
      amount: Math.max(amount, 0),
    });
  }
  return items;
}

export function installmentStatus(dueDate: string, amount: number, paidAmount: number, today: string): string {
  const paid = roundMoney(paidAmount);
  const total = roundMoney(amount);
  if (paid >= total && total > 0) return "paid";
  if (paid > 0) return "partially_paid";
  if (dueDate < today) return "overdue";
  if (dueDate === today) return "due";
  return "upcoming";
}
