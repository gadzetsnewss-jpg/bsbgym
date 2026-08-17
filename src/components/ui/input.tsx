import * as React from "react";
import { cn } from "@/lib/utils";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  /** When true, renders invalid styling for validation. */
  invalid?: boolean;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, invalid = false, type = "text", ...props }, ref) => {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={invalid || undefined}
        className={cn(
          "h-10 w-full rounded-lg border bg-white px-3 py-2 text-sm text-ink shadow-card transition-colors",
          "placeholder:text-neutral-400",
          "focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25",
          "disabled:cursor-not-allowed disabled:opacity-50",
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

Input.displayName = "Input";
