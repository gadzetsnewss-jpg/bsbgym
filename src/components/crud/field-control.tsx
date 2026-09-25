"use client";

/**
 * Renders a single resource field as the matching UI primitive.
 * Used by both the generic form and (read-only) the detail view.
 */

import * as React from "react";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { formatDate, formatDateTime } from "@/lib/format";
import type { FieldValue, ResourceField } from "@/lib/crud/types";

export interface FieldControlProps {
  field: ResourceField;
  value: FieldValue;
  error?: string;
  disabled?: boolean;
  options?: readonly SelectOption[];
  onChange: (name: string, value: FieldValue) => void;
}

const INPUT_TYPE: Partial<Record<NonNullable<ResourceField["type"]>, string>> = {
  text: "text",
  email: "email",
  tel: "tel",
  url: "url",
  number: "number",
  date: "date",
  datetime: "datetime-local",
};

export function FieldControl({
  field,
  value,
  error,
  disabled = false,
  options,
  onChange,
}: FieldControlProps) {
  const type = field.type ?? "text";

  if (type === "checkbox") {
    return (
      <div className="flex min-w-0 items-start gap-3 pt-1.5">
        <Checkbox
          id={`field-${field.name}`}
          checked={value === true}
          disabled={disabled || field.readOnly}
          onChange={(event) => onChange(field.name, event.target.checked)}
        />
        <div className="min-w-0">
          <label
            htmlFor={`field-${field.name}`}
            className="text-sm font-medium text-ink"
          >
            {field.label}
          </label>
          {field.hint && (
            <p className="mt-0.5 text-xs text-neutral-500">{field.hint}</p>
          )}
        </div>
      </div>
    );
  }

  const common = {
    id: `field-${field.name}`,
    disabled: disabled || field.readOnly,
    "aria-invalid": error ? true : undefined,
  } as const;

  let control: React.ReactNode;
  if (type === "textarea") {
    control = (
      <Textarea
        {...common}
        rows={field.rows ?? 3}
        placeholder={field.placeholder}
        value={String(value ?? "")}
        invalid={Boolean(error)}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  } else if (type === "select") {
    control = (
      <Select
        {...common}
        options={options ?? field.options ?? []}
        placeholder={field.placeholder ?? "Select an option"}
        value={String(value ?? "")}
        invalid={Boolean(error)}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
  } else {
    const input = (
      <Input
        {...common}
        type={INPUT_TYPE[type] ?? "text"}
        inputMode={type === "number" ? "decimal" : undefined}
        min={field.min}
        max={field.max}
        step={field.step}
        placeholder={field.placeholder}
        autoComplete={field.autoComplete}
        value={String(value ?? "")}
        invalid={Boolean(error)}
        className={cn(
          field.prefix && "pl-7",
          field.suffix && "pr-10",
        )}
        onChange={(event) => onChange(field.name, event.target.value)}
      />
    );
    control =
      field.prefix || field.suffix ? (
        <div className="relative">
          {field.prefix && (
            <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-neutral-400">
              {field.prefix}
            </span>
          )}
          {input}
          {field.suffix && (
            <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-sm text-neutral-400">
              {field.suffix}
            </span>
          )}
        </div>
      ) : (
        input
      );
  }

  return (
    <FormField
      label={field.label}
      required={field.required}
      hint={field.hint}
      error={error}
      htmlFor={`field-${field.name}`}
      className={field.span === 2 ? "sm:col-span-2" : undefined}
    >
      {control}
    </FormField>
  );
}

/** Plain text representation of a field value for the detail page. */
export function displayFieldValue(
  field: ResourceField,
  value: FieldValue,
  options?: readonly SelectOption[],
): string {
  const type = field.type ?? "text";
  if (type === "checkbox") return value === true ? "Yes" : "No";
  const raw = String(value ?? "").trim();
  if (raw === "") return "—";
  if (type === "select") {
    const match = (options ?? field.options)?.find((option) => option.value === raw);
    if (match) return match.label;
  }
  if (type === "date") return formatDate(raw);
  if (type === "datetime") return formatDateTime(raw);
  if (type === "number" && field.prefix) return `${field.prefix}${raw}`;
  if (type === "number" && field.suffix) return `${raw} ${field.suffix}`;
  return raw;
}
