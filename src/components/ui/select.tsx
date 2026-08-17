import * as React from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  options: readonly SelectOption[];
  placeholder?: string;
  invalid?: boolean;
}

export const Select = React.forwardRef<HTMLSelectElement, SelectProps>(
  ({ className, options, placeholder, invalid = false, ...props }, ref) => {
    return (
      <div className="relative">
        <select
          ref={ref}
          aria-invalid={invalid || undefined}
          className={cn(
            "h-10 w-full appearance-none rounded-lg border bg-white px-3 pr-9 text-sm text-ink shadow-card transition-colors",
            "focus-visible:border-primary-500 focus-visible:ring-2 focus-visible:ring-primary-500/25",
            "disabled:cursor-not-allowed disabled:opacity-50",
            invalid
              ? "border-red-400 focus-visible:border-red-500 focus-visible:ring-red-500/25"
              : "border-border",
            className,
          )}
          {...props}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
        <ChevronDown
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2 text-neutral-400"
        />
      </div>
    );
  },
);

Select.displayName = "Select";
