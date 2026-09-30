"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddAttendanceForm() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  return (
    <OperationsForm
      resource="attendance_records"
      mode="create"
      defaults={memberId ? { memberId } : undefined}
    />
  );
}
