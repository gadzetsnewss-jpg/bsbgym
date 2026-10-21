import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchasesList } from "@/components/inventory/purchases-list";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Purchases" };

export default function PurchasesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading purchases…" />}>
      <PurchasesList />
    </Suspense>
  );
}
