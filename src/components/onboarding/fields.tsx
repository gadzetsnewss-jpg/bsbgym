"use client";

import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COUNTRIES, TIMEZONES } from "@/lib/validation/auth-schemas";

/**
 * Shared contact + address field sets used by the onboarding business/branch
 * steps and by settings forms. Field names are flat so the values object maps
 * 1:1 onto the zod schemas in `src/lib/validation/auth-schemas.ts`.
 */

export interface FlatFieldsProps {
  values: Record<string, string>;
  errors?: Record<string, string | undefined>;
  onChange: (field: string, value: string) => void;
  disabled?: boolean;
}

export function AddressFields({ values, errors, onChange, disabled }: FlatFieldsProps) {
  const value = (name: string) => values[name] ?? "";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div className="sm:col-span-2">
        <FormField label="Address line 1" error={errors?.addressLine1}>
          <Input
            autoComplete="address-line1"
            placeholder="Street address, building"
            value={value("addressLine1")}
            invalid={Boolean(errors?.addressLine1)}
            onChange={(event) => onChange("addressLine1", event.target.value)}
            disabled={disabled}
          />
        </FormField>
      </div>
      <div className="sm:col-span-2">
        <FormField label="Address line 2" error={errors?.addressLine2}>
          <Input
            autoComplete="address-line2"
            placeholder="Apartment, suite, unit (optional)"
            value={value("addressLine2")}
            invalid={Boolean(errors?.addressLine2)}
            onChange={(event) => onChange("addressLine2", event.target.value)}
            disabled={disabled}
          />
        </FormField>
      </div>
      <FormField label="City" error={errors?.city}>
        <Input
          autoComplete="address-level2"
          placeholder="Mumbai"
          value={value("city")}
          invalid={Boolean(errors?.city)}
          onChange={(event) => onChange("city", event.target.value)}
          disabled={disabled}
        />
      </FormField>
      <FormField label="State" error={errors?.state}>
        <Input
          autoComplete="address-level1"
          placeholder="Maharashtra"
          value={value("state")}
          invalid={Boolean(errors?.state)}
          onChange={(event) => onChange("state", event.target.value)}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Postal code" error={errors?.postalCode}>
        <Input
          autoComplete="postal-code"
          placeholder="400001"
          value={value("postalCode")}
          invalid={Boolean(errors?.postalCode)}
          onChange={(event) => onChange("postalCode", event.target.value)}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Country" error={errors?.country}>
        <Select
          options={[{ value: "", label: "Select a country" }, ...COUNTRIES]}
          value={value("country")}
          invalid={Boolean(errors?.country)}
          onChange={(event) => onChange("country", event.target.value)}
          disabled={disabled}
        />
      </FormField>
    </div>
  );
}

export interface ContactFieldsProps extends FlatFieldsProps {
  withWebsite?: boolean;
}

export function ContactFields({
  values,
  errors,
  onChange,
  disabled,
  withWebsite = false,
}: ContactFieldsProps) {
  const value = (name: string) => values[name] ?? "";

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField label="Email" error={errors?.email}>
        <Input
          type="email"
          autoComplete="email"
          placeholder="info@yourgym.com"
          value={value("email")}
          invalid={Boolean(errors?.email)}
          onChange={(event) => onChange("email", event.target.value)}
          disabled={disabled}
        />
      </FormField>
      <FormField label="Phone" error={errors?.phone}>
        <Input
          type="tel"
          autoComplete="tel"
          placeholder="+91 90000 00000"
          value={value("phone")}
          invalid={Boolean(errors?.phone)}
          onChange={(event) => onChange("phone", event.target.value)}
          disabled={disabled}
        />
      </FormField>
      {withWebsite && (
        <div className="sm:col-span-2">
          <FormField label="Website" error={errors?.website}>
            <Input
              type="url"
              autoComplete="url"
              placeholder="https://yourgym.com"
              value={value("website")}
              invalid={Boolean(errors?.website)}
              onChange={(event) => onChange("website", event.target.value)}
              disabled={disabled}
            />
          </FormField>
        </div>
      )}
    </div>
  );
}

export function TimezoneField({ values, errors, onChange, disabled }: FlatFieldsProps) {
  return (
    <FormField label="Timezone" error={errors?.timezone}>
      <Select
        options={[{ value: "", label: "Select a timezone" }, ...TIMEZONES]}
        value={values.timezone ?? ""}
        invalid={Boolean(errors?.timezone)}
        onChange={(event) => onChange("timezone", event.target.value)}
        disabled={disabled}
      />
    </FormField>
  );
}
