import type { Metadata } from "next";
import { ReportsOverviewScreen } from "@/components/reports/reports-overview";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage() {
  return <ReportsOverviewScreen />;
}
