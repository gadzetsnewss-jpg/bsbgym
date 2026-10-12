import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCrmForm } from "@/components/crm/add-crm-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add lead" };

export default function AddLeadPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading lead form…" />}>
      <AddCrmForm resource="leads" />
    </Suspense>
  );
}
