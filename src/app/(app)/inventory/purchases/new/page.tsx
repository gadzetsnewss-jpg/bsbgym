import type { Metadata } from "next";
import { Suspense } from "react";
import { PurchaseForm } from "@/components/inventory/purchase-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "New purchase" };

export default function NewPurchasePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading purchase form…" />}>
      <PurchaseForm />
    </Suspense>
  );
}
