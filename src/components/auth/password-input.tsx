"use client";

import * as React from "react";
import { CircleAlert, Eye, EyeOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";

export interface PasswordInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {
  invalid?: boolean;
  /** Accessible label for the show/hide toggle. */
  toggleLabel?: string;
}

/** Text input with a built-in show/hide password toggle. */
export const PasswordInput = React.forwardRef<HTMLInputElement, PasswordInputProps>(
  ({ className, invalid = false, toggleLabel = "Toggle password visibility", ...props }, ref) => {
    const [visible, setVisible] = React.useState(false);

    return (
      <div className="relative">
        <Input
          ref={ref}
          type={visible ? "text" : "password"}
          invalid={invalid}
          className={cn("pr-11", className)}
          {...props}
        />
        <button
          type="button"
          aria-label={visible ? "Hide password" : "Show password"}
          aria-pressed={visible}
          title={toggleLabel}
          onClick={() => setVisible((prev) => !prev)}
          className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
        >
          {visible ? (
            <EyeOff aria-hidden="true" className="size-4" />
          ) : (
            <Eye aria-hidden="true" className="size-4" />
          )}
        </button>
      </div>
    );
  },
);

PasswordInput.displayName = "PasswordInput";

/** Banner shown on auth screens when no Supabase project is configured. */
export function NotConfiguredNotice({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-lg border border-amber-200 bg-amber-50 p-3.5",
        className,
      )}
    >
      <CircleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-amber-600" />
      <p className="text-xs leading-relaxed text-amber-800">
        Supabase is not configured in this environment, so real sign-in is
        unavailable here. Set <code className="font-semibold">NEXT_PUBLIC_SUPABASE_URL</code> and{" "}
        <code className="font-semibold">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> to enable
        authentication.
      </p>
    </div>
  );
}
