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
import { Textarea } from "@/components/ui/textarea";
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
import { invoiceSettingsSchema } from "@/lib/validation/auth-schemas";

type InvoiceValues = z.infer<typeof invoiceSettingsSchema>;

const PADDING_OPTIONS = [
  { value: "3", label: "3 digits (001)" },
  { value: "4", label: "4 digits (0001)" },
  { value: "5", label: "5 digits (00001)" },
  { value: "6", label: "6 digits (000001)" },
];

const DEFAULTS: InvoiceValues = {
  prefix: "INV",
  nextNumber: 1,
  padding: 4,
  includeGstin: true,
  footerNote: "",
  terms: "",
};

function fromRecord(record: Record<string, unknown>): InvoiceValues {
  return {
    prefix: typeof record.prefix === "string" && record.prefix ? record.prefix : DEFAULTS.prefix,
    nextNumber:
      typeof record.nextNumber === "number" && Number.isFinite(record.nextNumber)
        ? record.nextNumber
        : DEFAULTS.nextNumber,
    padding:
      typeof record.padding === "number" && Number.isFinite(record.padding)
        ? record.padding
        : DEFAULTS.padding,
    includeGstin: typeof record.includeGstin === "boolean" ? record.includeGstin : DEFAULTS.includeGstin,
    footerNote: typeof record.footerNote === "string" ? record.footerNote : "",
    terms: typeof record.terms === "string" ? record.terms : "",
  };
}

export function InvoiceSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;

  const [values, setValues] = React.useState<InvoiceValues>(DEFAULTS);
  const [errors, setErrors] = React.useState<Partial<Record<keyof InvoiceValues, string>>>({});
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
    const result = await fetchOrganizationSetting(orgId, "invoice");
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    setValues(fromRecord(settingValueAsRecord(result.data)));
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Invoice Settings" description="Invoice numbering and branding." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit invoice numbering."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  const setField = <K extends keyof InvoiceValues>(field: K, value: InvoiceValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage) return;

    const parsed = invoiceSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof InvoiceValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof InvoiceValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, "invoice", parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setSaved(true);
    toast({ title: "Invoice settings saved", variant: "success" });
  };

  const sample = `${values.prefix}-${String(values.nextNumber || 1).padStart(Number(values.padding) || 4, "0")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Settings"
        description="Numbering, GSTIN display and notes used when invoices are generated."
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
        <LoadingState label="Loading invoice settings…" />
      ) : loadError ? (
        <ErrorState title="Could not load invoice settings" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-5">
          {saved && (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
              Changes saved successfully.
            </div>
          )}

          <FormSection title="Numbering" description="Used as the default for new invoices.">
            <FormField label="Prefix" required error={errors.prefix}>
              <Input
                value={values.prefix}
                invalid={Boolean(errors.prefix)}
                onChange={(event) => setField("prefix", event.target.value.toUpperCase())}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Next number" required error={errors.nextNumber}>
              <Input
                type="number"
                min={1}
                value={values.nextNumber}
                invalid={Boolean(errors.nextNumber)}
                onChange={(event) => setField("nextNumber", Number(event.target.value))}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Padding" required error={errors.padding}>
              <Select
                options={PADDING_OPTIONS}
                value={String(values.padding)}
                invalid={Boolean(errors.padding)}
                onChange={(event) => setField("padding", Number(event.target.value))}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Preview">
              <Input value={sample} readOnly disabled />
            </FormField>
          </FormSection>

          <FormSection title="Display" description="What appears on generated invoices." columns={1}>
            <label className="flex items-start gap-2 text-sm text-ink">
              <Checkbox
                checked={values.includeGstin}
                onChange={(event) => setField("includeGstin", event.target.checked)}
                disabled={!canManage}
              />
              <span>Show organization GSTIN on invoices</span>
            </label>
            <FormField label="Footer note" error={errors.footerNote}>
              <Input
                value={values.footerNote}
                invalid={Boolean(errors.footerNote)}
                onChange={(event) => setField("footerNote", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Terms" error={errors.terms}>
              <Textarea
                rows={4}
                value={values.terms}
                onChange={(event) => setField("terms", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
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
