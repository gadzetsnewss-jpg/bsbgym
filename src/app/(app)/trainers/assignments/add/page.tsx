import type { Metadata } from "next";
import { Suspense } from "react";
import { AddTrainerAssignmentForm } from "@/components/memberships/add-trainer-assignment-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add assignment" };

export default function AddTrainerAssignmentPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading assignment form…" />}>
      <AddTrainerAssignmentForm />
    </Suspense>
  );
}
