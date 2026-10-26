"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  Check,
  CheckCheck,
  CircleAlert,
  Info,
  TriangleAlert,
  CheckCircle2,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatDateTime } from "@/lib/format";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/notifications/client";
import {
  notificationTone,
  safeNotificationHref,
  type NotificationRow,
} from "@/lib/notifications/types";
import { cn } from "@/lib/utils";

const TONE_ICONS = {
  info: Info,
  warning: CircleAlert,
  danger: TriangleAlert,
  success: CheckCircle2,
} as const;

const TONE_COLORS = {
  info: "text-sky-500 bg-sky-50",
  warning: "text-amber-500 bg-amber-50",
  danger: "text-red-500 bg-red-50",
  success: "text-emerald-500 bg-emerald-50",
} as const;

export function NotificationCenterScreen() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const { toast } = useToast();
  const [rows, setRows] = React.useState<NotificationRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "unread">("all");
  const [saving, setSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchNotifications(orgId, { limit: 100 });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const visible = filter === "unread" ? rows.filter((row) => !row.isRead) : rows;
  const unreadCount = rows.filter((row) => !row.isRead).length;

  const markOne = async (id: string) => {
    setSaving(true);
    const result = await markNotificationRead(id);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not mark as read", description: result.error.message, variant: "error" });
      return;
    }
    setRows((current) => current.map((row) => (row.id === id ? { ...row, isRead: true } : row)));
  };

  const markAll = async () => {
    if (!orgId) return;
    setSaving(true);
    const result = await markAllNotificationsRead(orgId);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not mark all as read", description: result.error.message, variant: "error" });
      return;
    }
    setRows((current) => current.map((row) => ({ ...row, isRead: true })));
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="In-app alerts for your account. Opening a related record does not change invoices, payments or memberships. Email, WhatsApp and SMS are not sent from this screen."
        icon={Bell}
        actions={
          unreadCount > 0 ? (
            <Button variant="outline" onClick={() => void markAll()} disabled={saving}>
              <CheckCheck aria-hidden="true" className="size-4" />
              Mark all as read
            </Button>
          ) : null
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button variant={filter === "all" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("all")}>
          All
        </Button>
        <Button variant={filter === "unread" ? "secondary" : "ghost"} size="sm" onClick={() => setFilter("unread")}>
          Unread
          {unreadCount > 0 && (
            <Badge tone="primary" className="ml-1">
              {unreadCount}
            </Badge>
          )}
        </Button>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading ? (
        <LoadingState label="Loading notifications…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={Bell}
          title={filter === "unread" ? "No unread notifications" : "No notifications yet"}
          description="Reminders appear here when they are written to your inbox. Scheduled expiry or follow-up jobs are not running in this environment."
        />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-card border border-border bg-surface">
          {visible.map((row) => {
            const tone = notificationTone(row.type);
            const Icon = TONE_ICONS[tone];
            const href = safeNotificationHref(row.link);
            return (
              <li key={row.id} className={cn("flex items-start gap-3 px-4 py-3", !row.isRead && "bg-primary-50/40")}>
                <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg", TONE_COLORS[tone])}>
                  <Icon aria-hidden="true" className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{row.title}</p>
                  {row.body && <p className="mt-0.5 text-sm text-neutral-600">{row.body}</p>}
                  <p className="mt-1 text-xs text-neutral-400">{formatDateTime(row.createdAt)}</p>
                  {href && (
                    <Link
                      href={href}
                      onClick={() => {
                        if (!row.isRead) void markOne(row.id);
                      }}
                      className="mt-2 inline-flex text-sm font-medium text-primary-700 hover:text-primary-800"
                    >
                      Open related record
                    </Link>
                  )}
                </div>
                {!row.isRead && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Mark ${row.title} as read`}
                    onClick={() => void markOne(row.id)}
                    disabled={saving}
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Read
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
