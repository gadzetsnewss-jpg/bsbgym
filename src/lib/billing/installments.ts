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
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setMonth(date.getMonth() + months);
  return date.toISOString().slice(0, 10);
}

/** Splits `total` into `count` installments. First due at sale; last absorbs remainder. */
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
