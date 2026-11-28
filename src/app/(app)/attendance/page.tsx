import type { Metadata } from "next";
import { AttendanceHome } from "@/components/attendance/attendance-home";

export const metadata: Metadata = { title: "Attendance" };

export default function AttendancePage() {
  return <AttendanceHome />;
}
