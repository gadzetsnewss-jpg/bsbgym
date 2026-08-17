import * as React from "react";
import { cn } from "@/lib/utils";
import { Label } from "@/components/ui/label";

export interface FormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  /** Explicit id to associate with the control (optional, auto-generated). */
  htmlFor?: string;
  className?: string;
  children: React.ReactNode;
}

/**
 * Wraps a single form control with its label, hint and error message.
 * Injects `id`, `aria-describedby` and `aria-invalid` into the control so the
 * group is fully accessible with zero wiring at the call site.
 */
export function FormField({
  label,
  required,
  hint,
  error,
  htmlFor,
  className,
  children,
}: FormFieldProps) {
  const generatedId = React.useId();
  const controlId = htmlFor ?? `field-${generatedId}`;
  const hintId = `hint-${generatedId}`;
  const errorId = `error-${generatedId}`;
  const describedBy = error
    ? errorId
    : hint
      ? hintId
      : undefined;

  const control = React.isValidElement(children)
    ? React.cloneElement(children as React.ReactElement<Record<string, unknown>>, {
        id: controlId,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className={cn("min-w-0", className)}>
      <Label htmlFor={controlId} required={required}>
        {label}
      </Label>
      {control}
      {hint && !error && (
        <p id={hintId} className="mt-1.5 text-xs text-neutral-500">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-xs font-medium text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
