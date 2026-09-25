import type { Metadata } from "next";
import { TaxGstSettingsForm } from "@/components/settings/tax-gst-settings-form";

export const metadata: Metadata = {
  title: "Tax / GST Settings",
};

export default function TaxGstSettingsPage() {
  return <TaxGstSettingsForm />;
}
