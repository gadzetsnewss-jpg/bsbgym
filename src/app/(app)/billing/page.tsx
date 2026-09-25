import type { Metadata } from "next";
import { BillingDashboardScreen } from "@/components/billing/billing-dashboard";

export const metadata: Metadata = { title: "Billing" };

export default function BillingPage() {
  return <BillingDashboardScreen />;
}
