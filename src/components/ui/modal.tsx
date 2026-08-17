"use client";

import * as React from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Backdrop, Portal, useDialogBehavior } from "@/components/ui/dialog";

export type ModalSize = "sm" | "md" | "lg" | "xl";

const sizeClasses: Record<ModalSize, string> = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-2xl",
};

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  /** Footer action row rendered at the bottom. */
  footer?: React.ReactNode;
  size?: ModalSize;
  className?: string;
  /** Hides the built-in close button. */
  hideClose?: boolean;
}

export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
  className,
  hideClose = false,
}: ModalProps) {
  const panelRef = React.useRef<HTMLDivElement>(null);
  useDialogBehavior(open, onClose, panelRef);

  const titleId = React.useId();
  const descriptionId = React.useId();

  if (!open) return null;

  return (
    <Portal>
      <Backdrop onMouseDown={onClose}>
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby={titleId}
          aria-describedby={description ? descriptionId : undefined}
          tabIndex={-1}
          className={cn(
            "w-full rounded-panel border border-border bg-surface shadow-modal",
            "max-h-[85vh] overflow-y-auto",
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
            {!hideClose && (
              <button
                type="button"
                aria-label="Close dialog"
                onClick={onClose}
                className="rounded-lg p-1.5 text-neutral-400 transition-colors hover:bg-neutral-100 hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
              >
                <X aria-hidden="true" className="size-5" />
              </button>
            )}
          </div>

          <div className="px-5 py-4">{children}</div>

          {footer && (
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-5 py-3.5">
              {footer}
            </div>
          )}
        </div>
      </Backdrop>
    </Portal>
  );
}