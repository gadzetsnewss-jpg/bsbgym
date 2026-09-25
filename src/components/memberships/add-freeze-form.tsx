"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddMembershipFreezeForm() {
  const searchParams = useSearchParams();
  const membershipId = searchParams.get("membershipId") ?? "";
  return (
    <OperationsForm
      resource="membership_freezes"
      mode="create"
      defaults={membershipId ? { membershipId } : undefined}
    />
  );
}
