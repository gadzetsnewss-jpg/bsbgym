import type { Metadata } from "next";
import { Suspense } from "react";
import { CreditNotesList } from "@/components/billing/credit-notes-list";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Credit notes" };

export default function CreditNotesPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading credit notes…" />}>
      <CreditNotesList />
    </Suspense>
  );
}
