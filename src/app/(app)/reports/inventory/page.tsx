import type { Metadata } from "next";
import { CategoryReportScreen } from "@/components/reports/category-report";

export const metadata: Metadata = { title: "Inventory reports" };

export default function InventoryReportsPage() {
  return <CategoryReportScreen category="inventory" />;
}
