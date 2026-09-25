import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add check-in" };

export default function AddAttendancePage() {
  return <OperationsForm resource="attendance_records" mode="create" />;
}
