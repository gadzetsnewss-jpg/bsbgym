import type { Metadata } from "next";
import { ExpenseForm } from "@/components/finance/expense-form";

export const metadata: Metadata = { title: "Add expense" };

export default function NewExpensePage() {
  return <ExpenseForm />;
}
