import { describe, expect, it } from "vitest";
import { inclusiveDayCount, remainingDaysFromToday, remainingFreezeDays } from "@/lib/operations/freeze";

describe("inclusiveDayCount", () => {
  it("counts inclusive freeze days", () => {
    expect(inclusiveDayCount("2026-09-01", "2026-09-01")).toBe(1);
    expect(inclusiveDayCount("2026-09-01", "2026-09-10")).toBe(10);
  });

  it("returns 0 when the range is invalid", () => {
    expect(inclusiveDayCount("2026-09-10", "2026-09-01")).toBe(0);
    expect(inclusiveDayCount("", "2026-09-01")).toBe(0);
  });
});

describe("remainingDaysFromToday", () => {
  it("returns days until the end date", () => {
    expect(remainingDaysFromToday("2026-10-10", "2026-09-28")).toBe(12);
    expect(remainingDaysFromToday("2026-09-28", "2026-09-28")).toBe(0);
    expect(remainingDaysFromToday("2026-09-01", "2026-09-28")).toBe(0);
  });
});

describe("remainingFreezeDays", () => {
  it("never goes below zero", () => {
    expect(remainingFreezeDays(4, 10)).toBe(6);
    expect(remainingFreezeDays(10, 10)).toBe(0);
    expect(remainingFreezeDays(12, 10)).toBe(0);
  });
});
