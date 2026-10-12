import type { Metadata } from "next";
import { PrintSettingsForm } from "@/components/settings/print-settings-form";

export const metadata: Metadata = { title: "Print & Documents" };

export default function PrintSettingsPage() {
  return <PrintSettingsForm />;
}
