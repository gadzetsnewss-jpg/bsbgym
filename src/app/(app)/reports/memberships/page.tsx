import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "Membership reports" };

export default function MembershipReportsPage() {
  return <CategoryReportScreen category="memberships" />;
}
