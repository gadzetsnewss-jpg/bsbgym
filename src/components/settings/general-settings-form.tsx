"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { updateOrganizationPreferences, upsertOrganizationSetting } from "@/lib/org/settings";
import {
  generalSettingsSchema,
  CURRENCIES,
  DATE_FORMATS,
  TIMEZONES,
} from "@/lib/validation/auth-schemas";

type PrefValues = z.infer<typeof generalSettingsSchema>;

export function GeneralSettingsForm() {
  const { toast } = useToast();
  const { organization, updateOrganizationLocal, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");

  const [values, setValues] = React.useState<PrefValues>({
    currency: "INR",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof PrefValues, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!organization) return;
    setValues({
      currency: organization.currency,
      timezone: organization.timezone,
      dateFormat: organization.dateFormat,
    });
  }, [organization]);

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

  const setField = (field: keyof PrefValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage) return;

    const parsed = generalSettingsSchema.safeParse(values);
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

    await upsertOrganizationSetting(organization.id, "regional", {
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
    });
    setSubmitting(false);

    updateOrganizationLocal({
      ...organization,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
    });
    setSaved(true);
    toast({ title: "Preferences saved", description: "Regional defaults have been updated.", variant: "success" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="General Settings"
        description="Currency, timezone and date format defaults for this organization."
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

      <form onSubmit={handleSubmit} noValidate className="mx-auto max-w-2xl space-y-5">
        {saved && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
            Changes saved successfully.
          </div>
        )}

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
        </FormSection>

        {canManage && (
          <div className="flex items-center justify-end">
            <Button type="submit" isLoading={submitting}>
              Save changes
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
