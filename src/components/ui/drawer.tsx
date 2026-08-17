"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Portal, useDialogBehavior } from "@/components/ui/dialog";

export type DrawerSize = "sm" | "md" | "lg";

const sizeClasses: Record<DrawerSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-xl",
};

export interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Footer action row pinned to the bottom. */
  footer?: React.ReactNode;
  size?: DrawerSize;
  className?: string;
}

export function Drawer({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
}: DrawerProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogBehavior(open, onClose, panelRef);

  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) return null;

  return (
    <Portal>
      <div className="fixed inset-0 z-50 bg-ink/50 backdrop-blur-[2px]">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) onClose();
          }}
          className={cn(
            "fixed top-0 right-0 flex h-full w-full flex-col border-l border-border bg-surface shadow-modal",
            sizeClasses[size],
            className,
          )}
        >
          <div className="flex items-start justify-between gap-4 border-b border-border px-5 py-4">
            <div className="min-w-0">
              <h2 id={titleId} className="text-base font-semibold text-ink">
                {title}
              </h2>
              {description && (
                <p id={descriptionId} className="mt-0.5 text-sm text-neutral-500">
                  {description}
                </p>
              )}
            </div>
            <button
              type="button"
              aria-label="Close panel"
              onClick={onClose}
              className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
              {footer}
            </div>
          )}
        </div>
      </div>
    </Portal>
  );
}