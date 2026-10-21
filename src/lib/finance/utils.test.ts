import { describe, expect, it } from "vitest";
import { defaultFinanceRange, startOfMonthIso, todayIso } from "@/lib/finance/utils";

describe("finance date helpers", () => {
  it("defaults the finance window to the current month", () => {
    const range = defaultFinanceRange();
    expect(range.from).toBe(startOfMonthIso());
    expect(range.to).toBe(todayIso());
    expect(range.from <= range.to).toBe(true);
  });
});
