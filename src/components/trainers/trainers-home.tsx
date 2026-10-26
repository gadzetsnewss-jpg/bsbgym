"use client";

import { CatalogList } from "@/components/catalog/catalog-screens";
import { useOrganization } from "@/components/auth/org-provider";

export function TrainersHome() {
  const { hasRole } = useOrganization();

  if (hasRole(["member"])) {
    return (
      <CatalogList
        resource="trainers"
        title="My trainer"
        description="The trainer assigned to you."
        emptyDescription="Your gym can assign a trainer from Trainers > Assignments."
      />
    );
  }

  return <CatalogList resource="trainers" />;
}
