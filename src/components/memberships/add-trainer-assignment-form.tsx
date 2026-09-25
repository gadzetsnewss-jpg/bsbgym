"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddTrainerAssignmentForm() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  return (
    <OperationsForm
      resource="trainer_assignments"
      mode="create"
      defaults={memberId ? { memberId } : undefined}
    />
  );
}
