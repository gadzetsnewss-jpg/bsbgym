import type { Metadata } from "next";
import { Suspense } from "react";
import { AddOperationsForm } from "@/components/operations/add-operations-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add measurement" };

export default function AddMeasurementPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading measurement form…" />}>
      <AddOperationsForm resource="body_measurements" />
    </Suspense>
  );
}
