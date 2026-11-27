import type { Metadata } from "next";
import { Suspense } from "react";
import { DietPlanBuilder } from "@/components/fitness/diet-plan-builder";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add diet plan" };

export default function AddDietPlanPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading diet plan builder…" />}>
      <DietPlanBuilder mode="create" />
    </Suspense>
  );
}
