import type { Metadata } from "next";
import { Suspense } from "react";
import { AddOperationsForm } from "@/components/operations/add-operations-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add workout plan" };

export default function AddWorkoutPlanPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading workout plan form…" />}>
      <AddOperationsForm resource="workout_plans" />
    </Suspense>
  );
}
