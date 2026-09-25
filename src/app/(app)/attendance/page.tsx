import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return <OperationsList resource="attendance_records" />;
}
