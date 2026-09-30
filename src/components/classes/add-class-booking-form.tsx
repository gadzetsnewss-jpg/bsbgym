"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddClassBookingForm() {
  const searchParams = useSearchParams();
  const memberId = searchParams.get("memberId") ?? "";
  const classSessionId = searchParams.get("classSessionId") ?? "";
  const defaults: Record<string, string> = {};
  if (memberId) defaults.memberId = memberId;
  if (classSessionId) defaults.classSessionId = classSessionId;
  return (
    <OperationsForm
      resource="class_bookings"
      mode="create"
      defaults={Object.keys(defaults).length > 0 ? defaults : undefined}
    />
  );
}
