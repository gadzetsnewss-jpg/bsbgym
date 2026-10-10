import type { Metadata } from "next";
import { PaymentsSettingsForm } from "@/components/settings/payments-settings-form";

export const metadata: Metadata = { title: "Payments" };

export default function PaymentsSettingsPage() {
  return <PaymentsSettingsForm />;
}
