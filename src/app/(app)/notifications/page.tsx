import type { Metadata } from "next";
import { NotificationCenterScreen } from "@/components/notifications/notification-center";

export const metadata: Metadata = { title: "Notifications" };

export default function NotificationsPage() {
  return <NotificationCenterScreen />;
}
