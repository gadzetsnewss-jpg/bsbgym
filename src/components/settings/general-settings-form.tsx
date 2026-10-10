"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Select } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  fetchOrganizationSetting,
  updateOrganizationPreferences,
  upsertOrganizationSetting,
} from "@/lib/org/settings";
import { CURRENCIES, DATE_FORMATS, TIMEZONES } from "@/lib/validation/auth-schemas";
import { regionalSettingsSchema } from "@/lib/validation/settings-schemas";
import {
  DEFAULT_REGIONAL_SETTINGS,
  SETTINGS_KEYS,
  parseRegionalSettings,
  type RegionalSettings,
} from "@/lib/org/settings-catalog";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

type PrefValues = RegionalSettings;

export function GeneralSettingsForm() {
  const { toast } = useToast();
  const { organization, updateOrganizationLocal, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");

  const [values, setValues] = React.useState<PrefValues>(DEFAULT_REGIONAL_SETTINGS);
  const [baseline, setBaseline] = React.useState<PrefValues>(DEFAULT_REGIONAL_SETTINGS);
  const [errors, setErrors] = React.useState<Partial<Record<keyof PrefValues, string>>>({});
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const orgId = organization?.id;

  const load = React.useCallback(async () => {
    if (!orgId || !organization) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.regional);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parseRegionalSettings(result.data, {
      currency: organization.currency,
      timezone: organization.timezone,
      dateFormat: organization.dateFormat,
    });
    setValues(parsed);
    setBaseline(parsed);
  }, [orgId, organization]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="General Settings" description="Preferences and regional settings." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit regional defaults."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  const setField = <K extends keyof PrefValues>(field: K, value: PrefValues[K]) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage) return;

    const parsed = regionalSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof PrefValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof PrefValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const orgResult = await updateOrganizationPreferences({
      organizationId: organization.id,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
    });

    if (orgResult.error) {
      setSubmitting(false);
      toast({ title: "Could not save", description: orgResult.error.message, variant: "error" });
      return;
    }

    await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.regional, parsed.data);
    setSubmitting(false);

    updateOrganizationLocal({
      ...organization,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
    });
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Preferences saved", description: "Regional defaults have been updated.", variant: "success" });
  };

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Settings"
        description="Currency, timezone and date format defaults for this organization."
      />

      {!canManage && <SettingsViewOnly />}

      {loading ? (
        <LoadingState label="Loading regional settings…" />
      ) : loadError ? (
        <ErrorState title="Could not load regional settings" description={loadError} onRetry={() => void load()} />
      ) : (
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <SettingsSavedBanner visible={saved} />

        <FormSection title="Regional defaults" description="Applied to invoices, reports and new branches.">
          <FormField label="Currency" required error={errors.currency}>
            <Select
              options={[...CURRENCIES]}
              value={values.currency}
              invalid={Boolean(errors.currency)}
              onChange={(event) => setField("currency", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Timezone" required error={errors.timezone}>
            <Select
              options={[...TIMEZONES]}
              value={values.timezone}
              invalid={Boolean(errors.timezone)}
              onChange={(event) => setField("timezone", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Date format" required error={errors.dateFormat}>
            <Select
              options={[...DATE_FORMATS]}
              value={values.dateFormat}
              invalid={Boolean(errors.dateFormat)}
              onChange={(event) => setField("dateFormat", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Currency symbol">
            <Input
              value={values.currencySymbol}
              onChange={(event) => setField("currencySymbol", event.target.value)}
              disabled={!canManage}
              placeholder="Leave blank to use the currency code"
            />
          </FormField>
          <FormField label="Time format">
            <Select
              value={values.timeFormat}
              onChange={(event) => setField("timeFormat", event.target.value as PrefValues["timeFormat"])}
              disabled={!canManage}
              options={[
                { value: "12h", label: "12-hour" },
                { value: "24h", label: "24-hour" },
              ]}
            />
          </FormField>
          <FormField label="First day of week">
            <Select
              value={values.firstDayOfWeek}
              onChange={(event) => setField("firstDayOfWeek", event.target.value as PrefValues["firstDayOfWeek"])}
              disabled={!canManage}
              options={[
                { value: "monday", label: "Monday" },
                { value: "sunday", label: "Sunday" },
              ]}
            />
          </FormField>
        </FormSection>

        <SettingsActions
          canManage={canManage}
          submitting={submitting}
          dirty={dirty}
          onReset={() => {
            setValues(DEFAULT_REGIONAL_SETTINGS);
            setSaved(false);
          }}
        />
      </form>
      )}
    </div>
  );
}
