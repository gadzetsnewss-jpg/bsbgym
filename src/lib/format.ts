/**
 * Presentation-only formatting helpers (dates, phone display).
 * The database remains the source of truth for stored values.
 */

/** Format an ISO date / timestamp as a short local date. Returns "—" when empty. */
export function formatDate(value: string | null | undefined, locale = "en-GB"): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

/**
 * Format a date using the organization's configured date pattern
 * (`DD/MM/YYYY`, `MM/DD/YYYY` or `YYYY-MM-DD`). Falls back to `formatDate`.
 */
export function formatDatePattern(
  value: string | null | undefined,
  pattern = "DD/MM/YYYY",
): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = String(date.getFullYear());
  if (pattern === "MM/DD/YYYY") return `${month}/${day}/${year}`;
  if (pattern === "YYYY-MM-DD") return `${year}-${month}-${day}`;
  if (pattern === "DD/MM/YYYY") return `${day}/${month}/${year}`;
  return formatDate(value);
}

/** Format an ISO timestamp as a short local date and time. Returns "—" when empty. */
export function formatDateTime(value: string | null | undefined, locale = "en-GB"): string {
  if (!value) return "—";
  const date = value.length <= 10 ? new Date(`${value}T00:00:00`) : new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(locale, {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Format an amount using the organization's configured decimal precision. */
export function formatCurrencyWithDecimals(
  value: number | string | null | undefined,
  currency = "INR",
  decimalPlaces = 2,
  locale = "en-IN",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return "—";
  const digits = Math.min(4, Math.max(0, decimalPlaces));
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(digits)}`;
  }
}

/** Best-effort display name for a member-like record. */
export function displayName(parts: {
  fullName?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fallback?: string | null;
}): string {
  const joined = [parts.firstName, parts.lastName].filter(Boolean).join(" ").trim();
  return parts.fullName?.trim() || joined || parts.fallback?.trim() || "Unnamed member";
}

/** Format a monetary amount with its currency code (e.g. "₹1,200.00"). */
export function formatCurrency(
  value: number | string | null | undefined,
  currency = "INR",
  locale = "en-IN",
): string {
  if (value === null || value === undefined || value === "") return "—";
  const amount = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(amount)) return "—";
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${amount.toFixed(2)}`;
  }
}
