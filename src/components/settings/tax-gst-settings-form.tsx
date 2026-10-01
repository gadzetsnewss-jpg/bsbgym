"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  fetchOrganizationSetting,
  settingValueAsRecord,
  upsertOrganizationSetting,
} from "@/lib/org/settings";
import { GST_RATES, taxGstSettingsSchema } from "@/lib/validation/auth-schemas";

type TaxValues = z.infer<typeof taxGstSettingsSchema>;

const DEFAULTS: TaxValues = {
  gstRegistered: false,
  gstin: "",
  defaultGstRate: "18",
  hsnSac: "",
  placeOfSupply: "",
  reverseCharge: false,
  taxMode: "exclusive",
};

function fromRecord(record: Record<string, unknown>, orgGstin: string | null): TaxValues {
  const rate = String(record.defaultGstRate ?? DEFAULTS.defaultGstRate);
  const allowed = GST_RATES.some((item) => item.value === rate);
  const taxMode = record.taxMode === "inclusive" ? "inclusive" : "exclusive";
  return {
    gstRegistered: typeof record.gstRegistered === "boolean" ? record.gstRegistered : Boolean(orgGstin),
    gstin:
      typeof record.gstin === "string" && record.gstin
        ? record.gstin
        : orgGstin ?? "",
    defaultGstRate: (allowed ? rate : DEFAULTS.defaultGstRate) as TaxValues["defaultGstRate"],
    hsnSac: typeof record.hsnSac === "string" ? record.hsnSac : "",
    placeOfSupply: typeof record.placeOfSupply === "string" ? record.placeOfSupply : "",
    reverseCharge: typeof record.reverseCharge === "boolean" ? record.reverseCharge : false,
    taxMode,
  };
}

export function TaxGstSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;

  const [values, setValues] = React.useState<TaxValues>(DEFAULTS);
  const [errors, setErrors] = React.useState<Partial<Record<keyof TaxValues, string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const result = await fetchOrganizationSetting(orgId, "tax_gst");
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    setValues(fromRecord(settingValueAsRecord(result.data), organization?.gstin ?? null));
  }, [orgId, organization?.gstin]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Tax / GST Settings" description="Tax rates and registration details." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit GST defaults."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  const setField = <K extends keyof TaxValues>(field: K, value: TaxValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage) return;

    const parsed = taxGstSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof TaxValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof TaxValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, "tax_gst", parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setSaved(true);
    toast({ title: "Tax settings saved", variant: "success" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Tax / GST Settings"
        description="GST registration, default rate and place of supply for this organization."
      />

      {!canManage && (
        <Card>
          <CardHeader>
            <CardTitle>View only</CardTitle>
          </CardHeader>
          <p className="text-sm text-neutral-500">
            Your role can view these defaults but cannot change them.
          </p>
        </Card>
      )}

      {loading ? (
        <LoadingState label="Loading tax settings…" />
      ) : loadError ? (
        <ErrorState title="Could not load tax settings" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-5">
          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
              Changes saved successfully.
            </div>
          )}

          <FormSection title="Registration" description="GST identity used on invoices and reports.">
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 text-sm text-ink">
                <Checkbox
                  checked={values.gstRegistered}
                  onChange={(event) => setField("gstRegistered", event.target.checked)}
                  disabled={!canManage}
                />
                <span>This organization is GST registered</span>
              </label>
            </div>
            <FormField
              label="GSTIN"
              required={values.gstRegistered}
              error={errors.gstin}
              hint="15-character GST identification number."
            >
              <Input
                value={values.gstin}
                invalid={Boolean(errors.gstin)}
                onChange={(event) => setField("gstin", event.target.value.toUpperCase())}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Place of supply" error={errors.placeOfSupply}>
              <Input
                value={values.placeOfSupply}
                invalid={Boolean(errors.placeOfSupply)}
                onChange={(event) => setField("placeOfSupply", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
          </FormSection>

          <FormSection title="Defaults" description="Applied to new invoices.">
            <FormField
              label="Tax mode"
              required
              error={errors.taxMode}
              hint="Whether newly created invoice prices already include tax."
            >
              <Select
                value={values.taxMode}
                invalid={Boolean(errors.taxMode)}
                onChange={(event) => setField("taxMode", event.target.value as TaxValues["taxMode"])}
                disabled={!canManage}
                options={[
                  { value: "exclusive", label: "Tax exclusive" },
                  { value: "inclusive", label: "Tax inclusive" },
                ]}
              />
            </FormField>
            <FormField label="Default GST rate" required error={errors.defaultGstRate}>
              <Select
                options={[...GST_RATES]}
                value={values.defaultGstRate}
                invalid={Boolean(errors.defaultGstRate)}
                onChange={(event) =>
                  setField("defaultGstRate", event.target.value as TaxValues["defaultGstRate"])
                }
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Default HSN / SAC" error={errors.hsnSac}>
              <Input
                value={values.hsnSac}
                invalid={Boolean(errors.hsnSac)}
                onChange={(event) => setField("hsnSac", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
            <div className="sm:col-span-2">
              <label className="flex items-start gap-2 text-sm text-ink">
                <Checkbox
                  checked={values.reverseCharge}
                  onChange={(event) => setField("reverseCharge", event.target.checked)}
                  disabled={!canManage}
                />
                <span>Apply reverse charge by default</span>
              </label>
            </div>
          </FormSection>

          {canManage && (
            <div className="flex items-center justify-end">
              <Button type="submit" isLoading={submitting}>
                Save changes
              </Button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
