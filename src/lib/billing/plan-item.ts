export interface InvoicePlanOption {
  id: string;
  name: string;
  code: string;
  description: string | null;
  durationDays: number;
  price: number;
  signupFee: number;
  taxRate: number;
}

export const PLAN_SELECT_ITEM_TYPES = new Set(["membership", "renewal", "upgrade"]);

export function showsPlanSelector(itemType: string): boolean {
  return PLAN_SELECT_ITEM_TYPES.has(itemType);
}

export function requiresMembershipPlan(itemType: string): boolean {
  return itemType === "membership";
}

export function planItemDefaults(plan: InvoicePlanOption): {
  description: string;
  unitPrice: string;
  taxRate: string;
} {
  const duration = plan.durationDays > 0 ? ` · ${plan.durationDays} days` : "";
  const named = `${plan.name}${duration}`;
  return {
    description: plan.description?.trim() || named,
    unitPrice: String(plan.price),
    taxRate: plan.taxRate > 0 ? String(plan.taxRate) : "",
  };
}

export function planOptionLabel(plan: InvoicePlanOption, formatMoney: (value: number) => string): string {
  const code = plan.code ? ` (${plan.code})` : "";
  const duration = plan.durationDays > 0 ? ` · ${plan.durationDays} days` : "";
  return `${plan.name}${code}${duration} · ${formatMoney(plan.price)}`;
}

/* ---------------------------------------------------------------------------
   Membership validity
   Membership validity is the gym service window (start + plan duration +
   operator-chosen extra validity). It is independent of the invoice payment
   due date. All helpers work on plain ISO yyyy-mm-dd date strings.
   --------------------------------------------------------------------------- */

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  date.setUTCDate(date.getUTCDate() + days);
  return toIsoDate(date);
}

export function addMonthsIso(iso: string, months: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  const day = date.getUTCDate();
  date.setUTCDate(1);
  date.setUTCMonth(date.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate();
  date.setUTCDate(Math.min(day, lastDay));
  return toIsoDate(date);
}

export function daysBetweenIso(fromIso: string, toIso: string): number {
  const from = new Date(`${fromIso}T00:00:00Z`).getTime();
  const to = new Date(`${toIso}T00:00:00Z`).getTime();
  if (Number.isNaN(from) || Number.isNaN(to)) return 0;
  return Math.round((to - from) / 86400000);
}

/**
 * Base membership end date: start + plan duration, inclusive of the start day
 * (a 365-day plan starting 2026-10-01 ends 2027-09-30).
 */
export function computeBaseEndDate(startIso: string, durationDays: number): string {
  const span = Math.max(0, Math.floor(durationDays)) - 1;
  return addDaysIso(startIso, span);
}

export function computeValidityEnd(
  startIso: string,
  durationDays: number,
  extraMonths: number,
  extraDays: number,
): string {
  const base = computeBaseEndDate(startIso, durationDays);
  return addDaysIso(addMonthsIso(base, Math.max(0, Math.floor(extraMonths))), Math.max(0, Math.floor(extraDays)));
}
