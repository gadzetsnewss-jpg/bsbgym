import { describe, expect, it } from "vitest";
import { categoryOptions, EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/finance/categories";

describe("categoryOptions", () => {
  it("merges existing values with suggestions without inventing a new system", () => {
    const options = categoryOptions(["Cleaning", "Rent"], EXPENSE_CATEGORY_SUGGESTIONS);
    expect(options.some((option) => option.value === "Rent")).toBe(true);
    expect(options.some((option) => option.value === "Cleaning")).toBe(true);
    expect(new Set(options.map((option) => option.value)).size).toBe(options.length);
  });
});
