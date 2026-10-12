import type { Metadata } from "next";
import { Suspense } from "react";
import { AddCrmForm } from "@/components/crm/add-crm-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add referral" };

export default function AddReferralPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading referral form…" />}>
      <AddCrmForm resource="referrals" />
    </Suspense>
  );
}
