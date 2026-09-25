import type { Metadata } from "next";
import { Suspense } from "react";
import { AddMembershipFreezeForm } from "@/components/memberships/add-freeze-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add freeze" };

export default function AddMembershipFreezePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading freeze form…" />}>
      <AddMembershipFreezeForm />
    </Suspense>
  );
}
