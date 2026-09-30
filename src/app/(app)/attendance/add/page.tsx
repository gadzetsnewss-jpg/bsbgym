import type { Metadata } from "next";
import { Suspense } from "react";
import { AddAttendanceForm } from "@/components/attendance/add-attendance-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add check-in" };

export default function AddAttendancePage() {
  return (
    <Suspense fallback={<LoadingState label="Loading check-in form…" />}>
      <AddAttendanceForm />
    </Suspense>
  );
}
