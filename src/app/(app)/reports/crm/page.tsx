import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "CRM reports" };

export default function CrmReportsPage() {
  return <CategoryReportScreen category="crm" />;
}
