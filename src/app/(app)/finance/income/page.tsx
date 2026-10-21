import type { Metadata } from "next";
import { IncomeList } from "@/components/finance/income-list";

export const metadata: Metadata = { title: "Other income" };

export default function IncomePage() {
  return <IncomeList />;
}
