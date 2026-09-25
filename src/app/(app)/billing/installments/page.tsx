import type { Metadata } from "next";
import { InstallmentsList } from "@/components/billing/installments-list";

export const metadata: Metadata = { title: "Installments" };

export default function InstallmentsPage() {
  return <InstallmentsList />;
}
