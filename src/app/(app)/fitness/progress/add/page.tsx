import type { Metadata } from "next";
import { Suspense } from "react";
import { AddOperationsForm } from "@/components/operations/add-operations-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add progress entry" };

export default function AddProgressEntryPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading progress form…" />}>
      <AddOperationsForm resource="progress_entries" />
    </Suspense>
  );
}
