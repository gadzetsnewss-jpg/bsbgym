import type { Metadata } from "next";
import { Suspense } from "react";
import { NewInvoiceForm } from "@/components/billing/new-invoice-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "New invoice" };

export default function NewInvoicePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading invoice form…" />}>
      <NewInvoiceForm />
    </Suspense>
  );
}
