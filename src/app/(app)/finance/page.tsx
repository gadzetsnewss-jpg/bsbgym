import type { Metadata } from "next";
import { FinanceDashboardScreen } from "@/components/finance/finance-dashboard";

export const metadata: Metadata = { title: "Finance" };

export default function FinancePage() {
  return <FinanceDashboardScreen />;
}
