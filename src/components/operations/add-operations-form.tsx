"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { OperationsForm } from "@/components/operations/operations-screens";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchLinkedTrainerId } from "@/lib/org/gym-members";
import type { ResourceValues } from "@/lib/crud/types";
import type { OperationsResourceKey } from "@/lib/operations/resources";

const QUERY_FIELDS = ["memberId", "trainerId", "branchId"] as const;

export function AddOperationsForm({ resource }: { resource: OperationsResourceKey }) {
  const searchParams = useSearchParams();
  const { organization, profile, hasRole } = useOrganization();
  const [resolvedDefaults, setResolvedDefaults] = React.useState<ResourceValues | null>(null);

  React.useEffect(() => {
    let active = true;
    const initial: ResourceValues = {};
    for (const field of QUERY_FIELDS) {
      const value = searchParams.get(field);
      if (value) initial[field] = value;
    }

    if (
      hasRole(["trainer"]) &&
      organization?.id &&
      profile?.id &&
      (resource === "pt_sessions" || resource === "workout_plans" || resource === "diet_plans") &&
      !initial.trainerId
    ) {
      void fetchLinkedTrainerId(organization.id, profile.id).then((result) => {
        if (!active) return;
        if (result.data) {
          initial.trainerId = result.data;
        }
        setResolvedDefaults(initial);
      });
    } else {
      setResolvedDefaults(initial);
    }

    return () => {
      active = false;
    };
  }, [searchParams, hasRole, organization?.id, profile?.id, resource]);

  if (!resolvedDefaults) return null;

  return (
    <OperationsForm
      resource={resource}
      mode="create"
      defaults={Object.keys(resolvedDefaults).length > 0 ? resolvedDefaults : undefined}
    />
  );
}
