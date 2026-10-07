import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCrmForm } from "@/components/crm/add-crm-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add trial" };

export default function AddTrialPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading trial form…" />}>
      <AddCrmForm resource="trial_memberships" />
    </Suspense>
  );
}
