import type { Metadata } from "next";
import { SettingsHubHome } from "@/components/settings/settings-hub";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return <SettingsHubHome />;
}
