import type { Metadata } from "next";
import { NotificationSettingsForm } from "@/components/settings/notification-settings-form";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationSettingsPage() {
  return <NotificationSettingsForm />;
}
