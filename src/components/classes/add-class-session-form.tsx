"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";

export function AddClassSessionForm() {
  const searchParams = useSearchParams();
  const classTemplateId = searchParams.get("classTemplateId") ?? "";
  return (
    <OperationsForm
      resource="class_sessions"
      mode="create"
      defaults={classTemplateId ? { classTemplateId } : undefined}
    />
  );
}
