import type { Metadata } from "next";
import { Suspense } from "react";
import { AddOperationsForm } from "@/components/operations/add-operations-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add diet plan" };

export default function AddDietPlanPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading diet plan form…" />}>
      <AddOperationsForm resource="diet_plans" />
    </Suspense>
  );
}
