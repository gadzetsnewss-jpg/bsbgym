"use client";

import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";
import type { ResourceValues } from "@/lib/crud/types";
import type { OperationsResourceKey } from "@/lib/operations/resources";

const QUERY_FIELDS = ["memberId", "trainerId", "branchId"] as const;

export function AddOperationsForm({ resource }: { resource: OperationsResourceKey }) {
  const searchParams = useSearchParams();
  const defaults: ResourceValues = {};
  for (const field of QUERY_FIELDS) {
    const value = searchParams.get(field);
    if (value) defaults[field] = value;
  }
  return (
    <OperationsForm
      resource={resource}
      mode="create"
      defaults={Object.keys(defaults).length > 0 ? defaults : undefined}
    />
  );
}
