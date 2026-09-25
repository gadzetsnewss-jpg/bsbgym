import type { Metadata } from "next";
import { Suspense } from "react";
import { RefundsList } from "@/components/billing/refunds-list";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Refunds" };

export default function RefundsPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading refunds…" />}>
      <RefundsList />
    </Suspense>
  );
}
