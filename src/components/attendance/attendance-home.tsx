"use client";

import * as React from "react";
import { useOrganization } from "@/components/auth/org-provider";
import { MemberPortalAttendance } from "./member-portal-attendance";
import { TrainerPortalAttendance } from "./trainer-portal-attendance";
import { AttendanceDashboard } from "./attendance-dashboard";

export function AttendanceHome() {
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
  const isTrainer = hasRole(["trainer"]) || cookiePortal === "trainer";

  if (isMember) {
    return <MemberPortalAttendance />;
  }

  if (isTrainer) {
    return <TrainerPortalAttendance />;
  }

  return <AttendanceDashboard />;
}
