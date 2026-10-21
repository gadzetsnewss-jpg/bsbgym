import type { Metadata } from "next";
import { Suspense } from "react";
import { ExpenseDetail } from "@/components/finance/expense-detail";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Expense" };

export default async function ExpenseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingState label="Loading expense…" />}>
      <ExpenseDetail expenseId={id} />
    </Suspense>
  );
}
