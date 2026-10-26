"use client";

import { OperationsList } from "@/components/operations/operations-screens";
import { useOrganization } from "@/components/auth/org-provider";

export function PtSessionsHome() {
  const { hasRole } = useOrganization();

  if (hasRole(["member"])) {
    return (
      <OperationsList
        resource="pt_sessions"
        title="My PT"
        description="Personal training sessions with your trainer."
        emptyDescription="Personal training sessions with your trainer appear here."
      />
    );
  }

  if (hasRole(["trainer"])) {
    return (
      <OperationsList
        resource="pt_sessions"
        title="My PT sessions"
        description="Personal training sessions with your assigned members."
        emptyDescription="Sessions with your assigned members appear here."
      />
    );
  }

  return <OperationsList resource="pt_sessions" />;
}
