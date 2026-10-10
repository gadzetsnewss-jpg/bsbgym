"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
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
  DEFAULT_MEMBERSHIP_SETTINGS,
  SETTINGS_KEYS,
  parseMembershipSettings,
  type MembershipSettings,
} from "@/lib/org/settings-catalog";
import { membershipSettingsSchema } from "@/lib/validation/settings-schemas";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

export function MembershipSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;
  const [values, setValues] = React.useState<MembershipSettings>(DEFAULT_MEMBERSHIP_SETTINGS);
  const [baseline, setBaseline] = React.useState<MembershipSettings>(DEFAULT_MEMBERSHIP_SETTINGS);
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
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.membership);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parseMembershipSettings(result.data);
    setValues(parsed);
    setBaseline(parsed);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const setField = <K extends keyof MembershipSettings>(field: K, value: MembershipSettings[K]) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage || !organization) return;
    const parsed = membershipSettingsSchema.safeParse(values);
    if (!parsed.success) {
      toast({ title: "Check the membership defaults", variant: "error" });
      return;
    }
    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.membership, parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Membership defaults saved", variant: "success" });
  };

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Membership" description="Defaults used when creating or extending memberships." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit membership defaults."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Membership"
        description="Organization defaults only. Plan Master duration, price and freeze allowance still win when a plan is selected."
      />
      {!canManage && <SettingsViewOnly />}
      {loading ? (
        <LoadingState label="Loading membership defaults…" />
      ) : loadError ? (
        <ErrorState title="Could not load membership defaults" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <SettingsSavedBanner visible={saved} />
          <FormSection title="Start and extra validity" description="Used as suggestions on New Invoice. Plan duration is never overridden.">
            <FormField label="Start date default">
              <Select
                disabled={!canManage}
                value={values.startDateBehavior}
                onChange={(event) =>
                  setField("startDateBehavior", event.target.value as MembershipSettings["startDateBehavior"])
                }
                options={[
                  { value: "today", label: "Today" },
                  { value: "invoice_date", label: "Invoice date" },
                  { value: "plan_start", label: "Leave for the plan workflow" },
                ]}
              />
            </FormField>
            <FormField label="Default extra months" hint="Plan duration stays in Plan Master.">
              <Input
                type="number"
                min={0}
                disabled={!canManage}
                value={values.extraMonthsDefault}
                onChange={(event) => setField("extraMonthsDefault", Number(event.target.value))}
              />
            </FormField>
            <FormField label="Default extra days">
              <Input
                type="number"
                min={0}
                disabled={!canManage}
                value={values.extraDaysDefault}
                onChange={(event) => setField("extraDaysDefault", Number(event.target.value))}
              />
            </FormField>
            <FormField label="Suggested freeze days" hint="Cannot exceed the selected plan freeze allowance.">
              <Input
                type="number"
                min={0}
                disabled={!canManage}
                value={values.freezeDefaultDays}
                onChange={(event) => setField("freezeDefaultDays", Number(event.target.value))}
              />
            </FormField>
          </FormSection>
          <FormSection title="Trainer" columns={1}>
            <label className="flex items-start gap-2 text-sm text-ink">
              <Checkbox
                checked={values.trainerAssignOnConvert}
                disabled={!canManage}
                onChange={(event) => setField("trainerAssignOnConvert", event.target.checked)}
              />
              <span>Remind staff to assign a trainer after converting a lead.</span>
            </label>
          </FormSection>
          <SettingsActions
            canManage={canManage}
            submitting={submitting}
            dirty={dirty}
            onReset={() => {
              setValues(DEFAULT_MEMBERSHIP_SETTINGS);
              setSaved(false);
            }}
          />
        </form>
      )}
    </div>
  );
}
