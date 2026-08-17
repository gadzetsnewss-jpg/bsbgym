"use client";

import * as React from "react";
import Link from "next/link";
import {
  Bell,
  CheckCircle2,
  CircleAlert,
  Info,
  TriangleAlert,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MOCK_NOTIFICATIONS, type Notification } from "@/data/mock-org";
import { Badge } from "@/components/ui/badge";

const TONE_ICONS: Record<Notification["tone"], React.ComponentType<{ className?: string }>> = {
  info: Info,
  warning: CircleAlert,
  danger: TriangleAlert,
  success: CheckCircle2,
};

const TONE_COLORS: Record<Notification["tone"], string> = {
  info: "text-sky-500",
  warning: "text-amber-500",
  danger: "text-red-500",
  success: "text-emerald-500",
};

export function NotificationBell({ className }: { className?: string }) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const unreadCount = MOCK_NOTIFICATIONS.filter((n) => n.unread).length;

  const close = React.useCallback(() => setOpen(false), []);

  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        close();
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, close]);

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        className="relative inline-flex size-10 items-center justify-center rounded-lg border border-border bg-surface text-neutral-500 shadow-card transition-colors hover:bg-neutral-50 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
      >
        <Bell aria-hidden="true" className="size-5" />
        {unreadCount > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-2 right-2 size-2 rounded-full bg-primary-500 ring-2 ring-surface"
          />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Notifications"
          className="absolute top-full right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] rounded-lg border border-border bg-surface shadow-pop"
        >
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <p className="text-sm font-semibold text-ink">Notifications</p>
            <div className="flex items-center gap-2">
              <Badge tone="primary">{unreadCount} new</Badge>
              <button
                type="button"
                aria-label="Close notifications"
                onClick={close}
                className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          </div>
          <ul className="max-h-80 divide-y divide-border overflow-y-auto">
            {MOCK_NOTIFICATIONS.map((notification) => {
              const Icon = TONE_ICONS[notification.tone];
              return (
                <li key={notification.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-neutral-50"
                  >
                    <Icon
                      aria-hidden="true"
                      className={cn("mt-0.5 size-4 shrink-0", TONE_COLORS[notification.tone])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-ink">
                        {notification.title}
                      </span>
                      <span className="mt-0.5 block text-xs text-neutral-500">
                        {notification.description}
                      </span>
                      <span className="mt-1 block text-[11px] text-neutral-400">
                        {notification.time}
                      </span>
                    </span>
                    {notification.unread && (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-primary-500"
                      />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
          <Link
            href="/notifications"
            onClick={close}
            className="block border-t border-border px-4 py-2.5 text-center text-sm font-medium text-primary-700 transition-colors hover:bg-primary-50"
          >
            View all notifications
          </Link>
        </div>
      )}
    </div>
  );
}
