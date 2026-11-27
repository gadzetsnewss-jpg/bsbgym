"use client";

import * as React from "react";
import { CatalogList } from "@/components/catalog/catalog-screens";
import { useOrganization } from "@/components/auth/org-provider";

export function TrainersHome() {
  const { hasRole } = useOrganization();
  const [cookiePortal, setCookiePortal] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (typeof document !== "undefined") {
      const match = document.cookie.split("; ").find((row) => row.startsWith("bsb_portal="));
      if (match) setCookiePortal(decodeURIComponent(match.split("=")[1]));
    }
  }, []);

  if (hasRole(["member"]) || cookiePortal === "member") {
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
