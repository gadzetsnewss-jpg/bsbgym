"use client";

import { useSearchParams } from "next/navigation";
import { CrmForm } from "@/components/crm/crm-screens";
import type { ResourceValues } from "@/lib/crud/types";
import type { CrmResourceKey } from "@/lib/crm/resources";

const QUERY_FIELDS = ["leadId", "memberId", "branchId", "referrerMemberId"] as const;

function splitName(value: string | null): { firstName?: string; lastName?: string } {
  if (!value) return {};
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

export function AddCrmForm({ resource }: { resource: CrmResourceKey }) {
  const searchParams = useSearchParams();
  const defaults: ResourceValues = {};
  for (const field of QUERY_FIELDS) {
    const value = searchParams.get(field);
    if (value) defaults[field] = value;
  }
  const nameParts = splitName(searchParams.get("name"));
  if (nameParts.firstName) defaults.firstName = nameParts.firstName;
  if (nameParts.lastName) defaults.lastName = nameParts.lastName;
  const referredName = searchParams.get("referredName");
  if (referredName) defaults.referredName = referredName;
  return (
    <CrmForm
      resource={resource}
      mode="create"
      defaults={Object.keys(defaults).length > 0 ? defaults : undefined}
    />
  );
}
