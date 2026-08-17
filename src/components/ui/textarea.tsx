import * as React from "react";
import { cn } from "@/lib/utils";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid = false, ...props }, ref) => {
    return (
      <textarea
        ref={ref}
        aria-invalid={invalid || undefined}
        className={cn(
          "w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-card transition-colors",
          "placeholder:text-neutral-400",
          "focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "min-h-20 resize-y",
          invalid
            ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/25"
            : "border-border",
          className,
        )}
        {...props}
      />
    );
  },
);

Textarea.displayName = "Textarea";
