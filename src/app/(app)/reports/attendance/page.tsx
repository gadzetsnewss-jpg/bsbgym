import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "Attendance reports" };

export default function AttendanceReportsPage() {
  return <CategoryReportScreen category="attendance" />;
}
