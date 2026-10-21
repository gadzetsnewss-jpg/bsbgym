/**
 * Suggested labels for the existing free-text `category` columns on
 * expenses and income_entries. These are not a new category system -
 * staff can type any value; suggestions only speed up data entry.
 */

export const EXPENSE_CATEGORY_SUGGESTIONS = [
  "Rent",
  "Utilities",
  "Salaries",
  "Maintenance",
  "Marketing",
  "Equipment",
  "Supplies",
  "Insurance",
  "Software",
  "Travel",
  "Professional fees",
  "Other",
] as const;

export const INCOME_CATEGORY_SUGGESTIONS = [
  "Locker rental",
  "Guest pass",
  "Late fee",
  "Merchandise",
  "Sponsorship",
  "Miscellaneous",
  "Other",
] as const;

export function categoryOptions(
  existing: readonly string[],
  suggestions: readonly string[],
): { value: string; label: string }[] {
  const unique = Array.from(new Set([...suggestions, ...existing].map((value) => value.trim()).filter(Boolean)));
  unique.sort((a, b) => a.localeCompare(b));
  return unique.map((value) => ({ value, label: value }));
}
