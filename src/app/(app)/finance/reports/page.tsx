import type { Metadata } from "next";
import { FinanceReportsScreen } from "@/components/finance/finance-reports";

export const metadata: Metadata = { title: "Finance reports" };

export default function FinanceReportsPage() {
  return <FinanceReportsScreen />;
}
