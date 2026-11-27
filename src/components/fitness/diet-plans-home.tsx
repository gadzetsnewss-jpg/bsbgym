"use client";

import * as React from "react";
import { useOrganization } from "@/components/auth/org-provider";
import { MemberDietPlanView } from "@/components/fitness/member-diet-plan-view";
import { DietPlansList } from "@/components/fitness/diet-plans-list";

export function DietPlansHome() {
  const { hasRole } = useOrganization();
  const [cookiePortal, setCookiePortal] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie
        .split("; ")
        .find((row) => row.startsWith("bsb_portal="));
      if (match) setCookiePortal(decodeURIComponent(match.split("=")[1]));
    }
  }, []);

  const isMember = hasRole(["member"]) || cookiePortal === "member";

  if (isMember) {
    return <MemberDietPlanView />;
  }

  return <DietPlansList />;
}
