import type { Metadata } from "next";
import { Suspense } from "react";
import { ProgressAndMeasurementsScreen } from "@/components/fitness/progress-and-measurements";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Progress & Measurements" };

export default function ProgressPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading progress and measurements…" />}>
      <ProgressAndMeasurementsScreen />
    </Suspense>
  );
}
