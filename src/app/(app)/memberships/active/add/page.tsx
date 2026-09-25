import type { Metadata } from "next";
import { Suspense } from "react";
import { AddMembershipForm } from "@/components/memberships/add-membership-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add membership" };

export default function AddActiveMembershipPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading membership form…" />}>
      <AddMembershipForm />
    </Suspense>
  );
}
