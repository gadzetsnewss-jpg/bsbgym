import type { Metadata } from "next";
import { ExpenseForm } from "@/components/finance/expense-form";

export const metadata: Metadata = { title: "Edit expense" };

export default async function EditExpensePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ExpenseForm expenseId={id} />;
}
