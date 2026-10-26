import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "POS reports" };

export default function PosReportsPage() {
  return <CategoryReportScreen category="pos" />;
}
