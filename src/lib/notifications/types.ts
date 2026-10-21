/**
 * In-app notification shapes. Columns match `public.notifications`.
 * Opening a related record never mutates finance or memberships.
 */

export const NOTIFICATION_TYPES = ["info", "warning", "danger", "success"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

export interface NotificationRow {
  id: string;
  organizationId: string;
  recipientId: string;
  title: string;
  body: string | null;
  type: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

export function notificationTone(type: string): "info" | "warning" | "danger" | "success" {
  if (type === "warning" || type === "danger" || type === "success") return type;
  return "info";
}

/**
 * Safe in-app path from the stored `link` column. External URLs are ignored
 * so a notification cannot navigate the staff user off the app.
 */
export function safeNotificationHref(link: string | null | undefined): string | null {
  if (!link) return null;
  const trimmed = link.trim();
  if (!trimmed.startsWith("/")) return null;
  if (trimmed.startsWith("//")) return null;
  if (trimmed.includes("://")) return null;
  return trimmed;
}
