"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
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
import { fetchOrganizationSetting, upsertOrganizationSetting } from "@/lib/org/settings";
import { invoiceSettingsSchema } from "@/lib/validation/auth-schemas";
import {
  DEFAULT_INVOICE_SETTINGS,
  SETTINGS_KEYS,
  parseInvoiceSettings,
  paymentMethodLabel,
} from "@/lib/org/settings-catalog";
import { PAYMENT_METHODS } from "@/lib/billing/types";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

type InvoiceValues = z.infer<typeof invoiceSettingsSchema>;

const PADDING_OPTIONS = [
  { value: "3", label: "3 digits (001)" },
  { value: "4", label: "4 digits (0001)" },
  { value: "5", label: "5 digits (00001)" },
  { value: "6", label: "6 digits (000001)" },
];

const DEFAULTS: InvoiceValues = DEFAULT_INVOICE_SETTINGS;

export function InvoiceSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;

  const [values, setValues] = React.useState<InvoiceValues>(DEFAULTS);
  const [baseline, setBaseline] = React.useState<InvoiceValues>(DEFAULTS);
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
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.invoice);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parseInvoiceSettings(result.data);
    setValues(parsed);
    setBaseline(parsed);
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
    const result = await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.invoice, parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Invoice settings saved", variant: "success" });
  };

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const sample = `${values.prefix}-${String(values.nextNumber || 1).padStart(Number(values.padding) || 4, "0")}`;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Invoice Settings"
        description="Numbering, GSTIN display and notes used when invoices are generated."
      />

      {!canManage && <SettingsViewOnly />}

      {loading ? (
        <LoadingState label="Loading invoice settings…" />
      ) : loadError ? (
        <ErrorState title="Could not load invoice settings" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <SettingsSavedBanner visible={saved} />

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
            <FormField label="Default notes" error={errors.defaultNotes}>
              <Textarea
                rows={3}
                value={values.defaultNotes ?? ""}
                onChange={(event) => setField("defaultNotes", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
          </FormSection>

          <FormSection title="Payment terms" description="New Invoice uses these without asking again.">
            <FormField label="Default due days" hint="0 means due on the invoice date." error={errors.dueDays}>
              <Input
                type="number"
                min={0}
                value={values.dueDays ?? 0}
                onChange={(event) => setField("dueDays", Number(event.target.value))}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Payment terms label" error={errors.paymentTerms}>
              <Input
                value={values.paymentTerms ?? ""}
                onChange={(event) => setField("paymentTerms", event.target.value)}
                disabled={!canManage}
              />
            </FormField>
            <FormField label="Default payment method">
              <Select
                value={values.defaultPaymentMethod ?? "upi"}
                onChange={(event) => setField("defaultPaymentMethod", event.target.value as InvoiceValues["defaultPaymentMethod"])}
                disabled={!canManage}
                options={PAYMENT_METHODS.map((item) => ({ value: item, label: paymentMethodLabel(item) }))}
              />
            </FormField>
            <FormField label="Round-off policy">
              <Select
                value={values.roundOffBehavior ?? "none"}
                onChange={(event) => setField("roundOffBehavior", event.target.value as InvoiceValues["roundOffBehavior"])}
                disabled={!canManage}
                options={[
                  { value: "none", label: "No automatic round-off" },
                  { value: "nearest", label: "Nearest rupee" },
                  { value: "up", label: "Round up" },
                  { value: "down", label: "Round down" },
                ]}
              />
            </FormField>
            <FormField label="Invoice date">
              <Select
                value={values.issueDateBehavior ?? "today"}
                onChange={(event) => setField("issueDateBehavior", event.target.value as InvoiceValues["issueDateBehavior"])}
                disabled={!canManage}
                options={[
                  { value: "today", label: "Today" },
                  { value: "blank", label: "Leave blank for staff" },
                ]}
              />
            </FormField>
          </FormSection>

          <SettingsActions
            canManage={canManage}
            submitting={submitting}
            dirty={dirty}
            onReset={() => {
              setValues(DEFAULTS);
              setSaved(false);
            }}
          />
        </form>
      )}
    </div>
  );
}
