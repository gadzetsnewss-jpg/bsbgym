import type { Metadata } from "next";
import { Suspense } from "react";
import { PosSaleForm } from "@/components/inventory/pos-sale-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "New sale" };

export default function NewSalePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading sale form…" />}>
      <PosSaleForm />
    </Suspense>
  );
}
