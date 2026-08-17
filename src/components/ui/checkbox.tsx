import * as React from "react";
import { cn } from "@/lib/utils";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type"> {}

export const Checkbox = React.forwardRef<HTMLInputElement, CheckboxProps>(
  ({ className, ...props }, ref) => {
    return (
      <input
        ref={ref}
        type="checkbox"
        className={cn(
          "size-4 shrink-0 cursor-pointer appearance-none rounded border border-neutral-300 bg-white align-middle",
          "checked:border-primary-600 checked:bg-primary-600 checked:bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns=%22http://www.w3.org/2000/svg%22%20viewBox=%220%200%2016%2016%22%3E%3Cpath%20fill=%22none%22%20stroke=%22white%22%20stroke-linecap=%22round%22%20stroke-linejoin=%22round%22%20stroke-width=%222.5%22%20d=%22M3.5%208.5l3%203%206-7%22/%3E%3C/svg%3E')]",
          "checked:bg-no-repeat checked:bg-center",
          "hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      />
    );
  },
);

Checkbox.displayName = "Checkbox";
