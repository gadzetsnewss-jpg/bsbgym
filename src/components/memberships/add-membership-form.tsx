"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddMembershipForm() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  const planId = searchParams.get("planId") ?? "";
  const branchId = searchParams.get("branchId") ?? "";
  const defaults: Record<string, string> = {};
  if (memberId) defaults.memberId = memberId;
  if (planId) defaults.planId = planId;
  if (branchId) defaults.branchId = branchId;
  return (
    <OperationsForm
      resource="memberships_active"
      mode="create"
      defaults={Object.keys(defaults).length > 0 ? defaults : undefined}
    />
  );
}
