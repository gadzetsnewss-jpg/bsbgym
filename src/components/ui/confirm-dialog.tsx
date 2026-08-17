"use client";

import { TriangleAlert } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

export interface ConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "danger" | "primary";
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  tone = "danger",
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      size="sm"
      hideClose
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={tone === "danger" ? "destructive" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
          >
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="flex gap-3">
        <div
          className={`flex size-10 shrink-0 items-center justify-center rounded-full ${
            tone === "danger"
              ? "bg-red-100 text-red-600"
              : "bg-primary-50 text-primary-700"
          }`}
        >
          <TriangleAlert aria-hidden="true" className="size-5" />
        </div>
        <p className="pt-2 text-sm leading-relaxed text-neutral-600">
          {description}
        </p>
      </div>
    </Modal>
  );
}