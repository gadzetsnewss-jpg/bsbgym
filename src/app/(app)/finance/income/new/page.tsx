import type { Metadata } from "next";
import { IncomeForm } from "@/components/finance/income-form";

export const metadata: Metadata = { title: "Add income" };

export default function NewIncomePage() {
  return <IncomeForm />;
}
