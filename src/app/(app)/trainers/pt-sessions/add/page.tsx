import type { Metadata } from "next";
import { Suspense } from "react";
import { AddOperationsForm } from "@/components/operations/add-operations-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add PT session" };

export default function AddPtSessionPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading PT session form…" />}>
      <AddOperationsForm resource="pt_sessions" />
    </Suspense>
  );
}
