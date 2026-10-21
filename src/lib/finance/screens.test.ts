/**
 * Source-level acceptance guards for Phase 8 screens.
 *
 * Live A-M cannot run against remote Supabase from this environment, so these
 * tests lock the beginner-facing copy and wiring that prevent double-counting.
 */

import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const dashboard = read("src/components/finance/finance-dashboard.tsx");
const reports = read("src/components/finance/finance-reports.tsx");
const expenseForm = read("src/components/finance/expense-form.tsx");
const incomeForm = read("src/components/finance/income-form.tsx");
const combine = read("COMBINE.sql");

describe("Phase 8 screen copy and wiring", () => {
  it("A/B: expense and income forms redirect to history after save", () => {
    expect(expenseForm).toMatch(/\/finance\/expenses\/\$\{id\}\?saved=1/);
    expect(incomeForm).toMatch(/\/finance\/income\/\$\{id\}\?saved=1/);
    expect(expenseForm).toMatch(/createExpense|updateExpense/);
    expect(incomeForm).toMatch(/createIncomeEntry|updateIncomeEntry/);
  });

  it("C/D: dashboard keeps invoiced, collected, POS and purchase costs separate", () => {
    expect(dashboard).toMatch(/Invoice payments \+ POS sales \+ other income/);
    expect(dashboard).toMatch(/Issued invoices in range — not cash received/);
    expect(dashboard).toMatch(/Unpaid invoice balance — a receivable, not cash/);
    expect(dashboard).toMatch(/never copied as expenses/);
  });

  it("I: reports refuse to label cash movement as profit", () => {
    expect(reports).toMatch(/not an accounting-grade profit figure/);
    expect(reports).toMatch(/It is not labelled profit/);
    expect(dashboard).toMatch(/Cash movement is not profit/);
  });

  it("J: screens format money and dates from Global Settings", () => {
    expect(dashboard).toMatch(/useFinanceSettings/);
    expect(reports).toMatch(/useFinanceSettings/);
    expect(expenseForm).toMatch(/paymentOptions/);
    expect(incomeForm).toMatch(/paymentOptions/);
  });

  it("K: write screens require finance.manage", () => {
    expect(expenseForm).toMatch(/can\("finance\.manage"\)/);
    expect(incomeForm).toMatch(/can\("finance\.manage"\)/);
  });

  it("COMBINE.sql includes the Phase 8 finance RPC migration", () => {
    expect(combine).toMatch(/20261014000031_finance_expenses_income_rpcs\.sql/);
    expect(combine).toMatch(/create or replace function public\.create_expense\(/);
    expect(combine).toMatch(/create or replace function public\.create_income_entry\(/);
  });
});
