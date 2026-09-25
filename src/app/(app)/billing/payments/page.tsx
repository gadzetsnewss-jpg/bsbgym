import type { Metadata } from "next";
import { PaymentsList } from "@/components/billing/payments-list";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsPage() {
  return <PaymentsList />;
}
