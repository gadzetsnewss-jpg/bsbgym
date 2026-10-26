import type { Metadata } from "next";
import { Suspense } from "react";
import { IncomeDetail } from "@/components/finance/income-detail";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Income" };

export default async function IncomeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <Suspense fallback={<LoadingState label="Loading income…" />}>
      <IncomeDetail entryId={id} />
    </Suspense>
  );
}
