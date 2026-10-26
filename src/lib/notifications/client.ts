/**
 * Phase 9 in-app notifications.
 *
 * Reads are recipient-scoped by RLS (`recipient_id = auth.uid()`). Writes go
 * only through `mark_notification_read` / `mark_all_notifications_read`.
 * Opening a notification never writes to finance, memberships, billing or CRM.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import type { NotificationRow } from "@/lib/notifications/types";

type AnyTable = "gym_members";
type AnyFunction = "create_gym_member";
type Row = Record<string, unknown>;

function clientOrNull() {
  return getSupabaseBrowserClient();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function asBoolean(value: unknown): boolean {
  return value === true;
}

function mapRow(row: Row): NotificationRow {
  return {
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    recipientId: asString(row.recipient_id),
    title: asString(row.title),
    body: asNullableString(row.body),
    type: asString(row.type) || "info",
    link: asNullableString(row.link),
    isRead: asBoolean(row.is_read),
    createdAt: asString(row.created_at),
  };
}

async function rpcVoid(fn: string, args: Record<string, unknown>): Promise<OrgResult> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { error } = await (
    supabase.rpc as unknown as (
      name: AnyFunction,
      params: Record<string, unknown>,
    ) => Promise<{ data: unknown; error: { message?: string } | null }>
  )(fn as AnyFunction, args);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function fetchNotifications(
  organizationId: string,
  opts: { unreadOnly?: boolean; limit?: number } = {},
): Promise<OrgResult<NotificationRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const limit = Math.min(200, Math.max(1, opts.limit ?? 50));
  let query = supabase
    .from("notifications" as AnyTable)
    .select("id, organization_id, recipient_id, title, body, type, link, is_read, created_at")
    .eq("organization_id", organizationId)
    .order("created_at" as "id", { ascending: false })
    .limit(limit);
  if (opts.unreadOnly) query = query.eq("is_read" as "id", false as unknown as string);
  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: ((data ?? []) as unknown as Row[]).map(mapRow), error: null };
}

export async function fetchUnreadNotificationCount(
  organizationId: string,
): Promise<OrgResult<number>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { count, error } = await supabase
    .from("notifications" as AnyTable)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("is_read" as "id", false as unknown as string);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: count ?? 0, error: null };
}

export async function markNotificationRead(notificationId: string): Promise<OrgResult> {
  return rpcVoid("mark_notification_read", { p_notification_id: notificationId });
}

export async function markAllNotificationsRead(organizationId: string): Promise<OrgResult> {
  return rpcVoid("mark_all_notifications_read", { p_org_id: organizationId });
}
