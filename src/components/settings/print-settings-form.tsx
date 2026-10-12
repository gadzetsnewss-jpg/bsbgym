"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
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
import { fetchOrganizationSetting, upsertOrganizationSetting } from "@/lib/org/settings";
import {
  DEFAULT_PRINT_SETTINGS,
  PAPER_PROFILES,
  SETTINGS_KEYS,
  parsePrintSettings,
  type PrintFieldVisibility,
  type PrintSettings,
} from "@/lib/org/settings-catalog";
import { printSettingsSchema } from "@/lib/validation/settings-schemas";
import { DocumentSheet } from "@/components/documents/document-sheet";
import { previewSampleDocument, sellerFromOrganization } from "@/lib/documents/engine";
import { DEFAULT_INVOICE_SETTINGS } from "@/lib/org/settings-catalog";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

const FIELD_LABELS: { key: keyof PrintFieldVisibility; label: string }[] = [
  { key: "logo", label: "Logo" },
  { key: "gstin", label: "GSTIN" },
  { key: "address", label: "Address" },
  { key: "phoneEmail", label: "Phone / email / website" },
  { key: "memberAddress", label: "Member address" },
  { key: "payments", label: "Payment details" },
  { key: "taxBreakup", label: "Tax breakup" },
  { key: "discount", label: "Discount" },
  { key: "terms", label: "Terms" },
  { key: "signature", label: "Signature" },
  { key: "productFooter", label: "BSB FitForge footer" },
];

export function PrintSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;
  const [values, setValues] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
  const [baseline, setBaseline] = React.useState<PrintSettings>(DEFAULT_PRINT_SETTINGS);
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
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.print);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parsePrintSettings(result.data);
    setValues(parsed);
    setBaseline(parsed);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const setField = <K extends keyof PrintSettings>(field: K, value: PrintSettings[K]) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage || !organization) return;
    const parsed = printSettingsSchema.safeParse(values);
    if (!parsed.success) {
      toast({ title: "Check the print settings", variant: "error" });
      return;
    }
    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.print, parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Print settings saved", variant: "success" });
  };

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Print & Documents" description="Paper size, template and field visibility." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit print defaults."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  const sample = previewSampleDocument(sellerFromOrganization(organization));

  return (
    <div className="space-y-6">
      <PageHeader
        title="Print & Documents"
        description="One document engine for invoices and receipts. Browser print is used. Direct ESC/POS is not available here."
      />
      {!canManage && <SettingsViewOnly />}
      {loading ? (
        <LoadingState label="Loading print settings…" />
      ) : loadError ? (
        <ErrorState title="Could not load print settings" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <SettingsSavedBanner visible={saved} />
          <FormSection title="Paper" description="Printer-agnostic. Uses the browser print dialog.">
            <FormField label="Paper size">
              <Select
                disabled={!canManage}
                value={values.paperSize}
                onChange={(event) => setField("paperSize", event.target.value as PrintSettings["paperSize"])}
                options={Object.values(PAPER_PROFILES).map((profile) => ({
                  value: profile.id,
                  label: profile.label,
                }))}
              />
            </FormField>
            <FormField label="Orientation">
              <Select
                disabled={!canManage}
                value={values.orientation}
                onChange={(event) => setField("orientation", event.target.value as PrintSettings["orientation"])}
                options={[
                  { value: "portrait", label: "Portrait" },
                  { value: "landscape", label: "Landscape" },
                ]}
              />
            </FormField>
            <FormField label="Template">
              <Select
                disabled={!canManage}
                value={values.template}
                onChange={(event) => setField("template", event.target.value as PrintSettings["template"])}
                options={[
                  { value: "standard", label: "Standard" },
                  { value: "compact", label: "Compact" },
                  { value: "detailed", label: "Detailed" },
                  { value: "thermal", label: "Thermal" },
                ]}
              />
            </FormField>
            {values.paperSize === "custom" ? (
              <>
                <FormField label="Custom width (mm)">
                  <Input
                    type="number"
                    disabled={!canManage}
                    value={values.customWidthMm}
                    onChange={(event) => setField("customWidthMm", Number(event.target.value))}
                  />
                </FormField>
                <FormField label="Custom height (mm)" hint="0 means continuous thermal roll.">
                  <Input
                    type="number"
                    disabled={!canManage}
                    value={values.customHeightMm}
                    onChange={(event) => setField("customHeightMm", Number(event.target.value))}
                  />
                </FormField>
              </>
            ) : null}
          </FormSection>
          <FormSection title="Layout">
            <FormField label="Top margin (mm)">
              <Input type="number" disabled={!canManage} value={values.marginTopMm} onChange={(event) => setField("marginTopMm", Number(event.target.value))} />
            </FormField>
            <FormField label="Right margin (mm)">
              <Input type="number" disabled={!canManage} value={values.marginRightMm} onChange={(event) => setField("marginRightMm", Number(event.target.value))} />
            </FormField>
            <FormField label="Bottom margin (mm)">
              <Input type="number" disabled={!canManage} value={values.marginBottomMm} onChange={(event) => setField("marginBottomMm", Number(event.target.value))} />
            </FormField>
            <FormField label="Left margin (mm)">
              <Input type="number" disabled={!canManage} value={values.marginLeftMm} onChange={(event) => setField("marginLeftMm", Number(event.target.value))} />
            </FormField>
            <FormField label="Scale (%)">
              <Input type="number" disabled={!canManage} value={values.scale} onChange={(event) => setField("scale", Number(event.target.value))} />
            </FormField>
            <FormField label="Font size">
              <Input type="number" disabled={!canManage} value={values.fontSize} onChange={(event) => setField("fontSize", Number(event.target.value))} />
            </FormField>
            <FormField label="Line spacing">
              <Input type="number" step={0.05} disabled={!canManage} value={values.lineSpacing} onChange={(event) => setField("lineSpacing", Number(event.target.value))} />
            </FormField>
            <FormField label="Header spacing">
              <Input type="number" disabled={!canManage} value={values.headerSpacing} onChange={(event) => setField("headerSpacing", Number(event.target.value))} />
            </FormField>
            <FormField label="Footer spacing">
              <Input type="number" disabled={!canManage} value={values.footerSpacing} onChange={(event) => setField("footerSpacing", Number(event.target.value))} />
            </FormField>
            <FormField label="Logo size">
              <Input type="number" disabled={!canManage} value={values.logoSize} onChange={(event) => setField("logoSize", Number(event.target.value))} />
            </FormField>
            <FormField label="Gym footer text" hint="Gym branding. BSB FitForge product footer stays separate.">
              <Input disabled={!canManage} value={values.footerText} onChange={(event) => setField("footerText", event.target.value)} />
            </FormField>
          </FormSection>
          <FormSection title="Visible fields" columns={1}>
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELD_LABELS.map((item) => (
                <label key={item.key} className="flex items-start gap-2 text-sm">
                  <Checkbox
                    checked={values.fields[item.key]}
                    disabled={!canManage}
                    onChange={(event) =>
                      setField("fields", { ...values.fields, [item.key]: event.target.checked })
                    }
                  />
                  <span>{item.label}</span>
                </label>
              ))}
            </div>
          </FormSection>
          <FormSection title="Live preview" description="Sample data. Real invoices use the same engine." columns={1}>
            <div className="overflow-auto rounded-lg bg-neutral-50 p-3">
              <DocumentSheet
                document={sample}
                config={{ print: values, invoice: DEFAULT_INVOICE_SETTINGS }}
                currency={organization.currency}
                preview
              />
            </div>
            <Button type="button" variant="outline" onClick={() => window.print()}>
              Print preview
            </Button>
          </FormSection>
          <SettingsActions
            canManage={canManage}
            submitting={submitting}
            dirty={dirty}
            onReset={() => {
              setValues(DEFAULT_PRINT_SETTINGS);
              setSaved(false);
            }}
          />
        </form>
      )}
    </div>
  );
}
