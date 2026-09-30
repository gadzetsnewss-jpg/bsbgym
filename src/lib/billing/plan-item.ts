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
