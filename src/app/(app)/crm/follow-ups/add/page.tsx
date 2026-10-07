import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCrmForm } from "@/components/crm/add-crm-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add follow-up" };

export default function AddFollowUpPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading follow-up form…" />}>
      <AddCrmForm resource="follow_ups" />
    </Suspense>
  );
}
