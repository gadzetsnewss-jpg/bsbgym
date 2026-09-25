"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddMembershipForm() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  return (
    <OperationsForm
      resource="memberships_active"
      mode="create"
      defaults={memberId ? { memberId } : undefined}
    />
  );
}
