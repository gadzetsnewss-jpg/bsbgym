import type { Metadata } from "next";
import { Suspense } from "react";
import { StockScreen } from "@/components/inventory/stock-screen";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Stock" };

export default function StockPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading stock…" />}>
      <StockScreen />
    </Suspense>
  );
}
