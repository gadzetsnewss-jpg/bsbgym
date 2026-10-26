import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "Member reports" };

export default function MemberReportsPage() {
  return <CategoryReportScreen category="members" />;
}
