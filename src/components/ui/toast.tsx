"use client";

import * as React from "react";
import { CheckCircle2, CircleAlert, Info, TriangleAlert, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "success" | "error" | "info" | "warning";

export interface ToastOptions {
  title: string;
  description?: string;
  variant?: ToastVariant;
  duration?: number;
}

export interface Toast extends Required<Omit<ToastOptions, "description">> {
  id: string;
  description?: string;
}

interface ToastContextValue {
  toast: (options: ToastOptions) => void;
  dismiss: (id: string) => void;
}

const ToastContext = React.createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return context;
}

const ICONS: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: TriangleAlert,
  info: Info,
  warning: CircleAlert,
};

const ACCENT: Record<ToastVariant, string> = {
  success: "text-emerald-500",
  error: "text-red-500",
  info: "text-sky-500",
  warning: "text-amber-500",
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<Toast[]>([]);

  const dismiss = React.useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const toast = React.useCallback(
    (options: ToastOptions) => {
      const id = `toast-${crypto.randomUUID()}`;
      const variant = options.variant ?? "info";
      const duration = options.duration ?? 4500;
      setToasts((prev) => [
        ...prev.slice(-3),
        { ...options, id, variant, duration },
      ]);
      if (duration > 0) {
        window.setTimeout(() => dismiss(id), duration);
      }
    },
    [dismiss],
  );

  const value = React.useMemo(() => ({ toast, dismiss }), [toast, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        aria-atomic="false"
        className="pointer-events-none fixed inset-x-4 top-4 z-[60] flex flex-col items-center gap-2 sm:items-end sm:right-4 sm:left-auto"
      >
        {toasts.map((item) => {
          const Icon = ICONS[item.variant];
          return (
            <div
              key={item.id}
              role="status"
              className={cn(
                "pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-lg border border-border bg-surface p-4 shadow-pop",
                "animate-[toast-in_0.2s_ease-out]",
              )}
            >
              <Icon aria-hidden="true" className={cn("mt-0.5 size-5 shrink-0", ACCENT[item.variant])} />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                {item.description && (
                  <p className="mt-0.5 text-sm text-neutral-500">
                    {item.description}
                  </p>
                )}
              </div>
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => dismiss(item.id)}
                className="rounded-md p-1 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X aria-hidden="true" className="size-4" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
