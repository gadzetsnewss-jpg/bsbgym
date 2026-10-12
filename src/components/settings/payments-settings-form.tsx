"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FormSection } from "@/components/ui/form-section";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Select } from "@/components/ui/select";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchOrganizationSetting, upsertOrganizationSetting } from "@/lib/org/settings";
import {
  DEFAULT_PAYMENTS_SETTINGS,
  SETTINGS_KEYS,
  parsePaymentsSettings,
  paymentMethodLabel,
  type PaymentsSettings,
} from "@/lib/org/settings-catalog";
import { paymentsSettingsSchema } from "@/lib/validation/settings-schemas";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

export function PaymentsSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;
  const [values, setValues] = React.useState<PaymentsSettings>(DEFAULT_PAYMENTS_SETTINGS);
  const [baseline, setBaseline] = React.useState<PaymentsSettings>(DEFAULT_PAYMENTS_SETTINGS);
  const [loading, setLoading] = React.useState(true);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError(null);
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.payments);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parsePaymentsSettings(result.data);
    setValues(parsed);
    setBaseline(parsed);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);

  const updateMethod = (code: string, patch: Partial<PaymentsSettings["methods"][number]>) => {
    setSaved(false);
    setFormError(null);
    setValues((prev) => ({
      methods: prev.methods.map((method) =>
        method.code === code
          ? {
              ...method,
              ...patch,
              isDefault: patch.isDefault === true ? true : patch.enabled === false ? false : method.isDefault,
            }
          : patch.isDefault === true
            ? { ...method, isDefault: false }
            : method,
      ),
    }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage || !organization) return;
    const parsed = paymentsSettingsSchema.safeParse(values);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Fix the highlighted fields.");
      return;
    }
    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.payments, parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Payment methods saved", variant: "success" });
  };

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Payments" description="Active methods used on invoices and split payments." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit payment methods."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Payments"
        description="Enable methods, set a default, and require a reference where needed. New Invoice and Split Payment use this list."
      />
      {!canManage && <SettingsViewOnly />}
      {loading ? (
        <LoadingState label="Loading payment methods…" />
      ) : loadError ? (
        <ErrorState title="Could not load payment methods" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <SettingsSavedBanner visible={saved} />
          {formError ? <p className="text-sm font-medium text-red-600">{formError}</p> : null}
          <FormSection title="Methods" description="Display order is top to bottom." columns={1}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs tracking-wide text-neutral-500 uppercase">
                  <tr>
                    <th className="py-2">Method</th>
                    <th className="py-2">Active</th>
                    <th className="py-2">Default</th>
                    <th className="py-2">Reference required</th>
                    <th className="py-2">Order</th>
                  </tr>
                </thead>
                <tbody>
                  {values.methods.map((method) => (
                    <tr key={method.code} className="border-t border-border">
                      <td className="py-2 font-medium">{paymentMethodLabel(method.code)}</td>
                      <td className="py-2">
                        <Checkbox
                          checked={method.enabled}
                          disabled={!canManage}
                          onChange={(event) => updateMethod(method.code, { enabled: event.target.checked })}
                        />
                      </td>
                      <td className="py-2">
                        <Checkbox
                          checked={method.isDefault}
                          disabled={!canManage || !method.enabled}
                          onChange={(event) => updateMethod(method.code, { isDefault: event.target.checked })}
                        />
                      </td>
                      <td className="py-2">
                        <Checkbox
                          checked={method.requireReference}
                          disabled={!canManage}
                          onChange={(event) => updateMethod(method.code, { requireReference: event.target.checked })}
                        />
                      </td>
                      <td className="py-2">
                        <Select
                          className="w-24"
                          disabled={!canManage}
                          value={String(method.sortOrder)}
                          onChange={(event) => updateMethod(method.code, { sortOrder: Number(event.target.value) })}
                          options={values.methods.map((_, index) => ({ value: String(index), label: String(index + 1) }))}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-neutral-500">
              Cash usually does not need a reference. UPI, card and bank transfer often do.
            </p>
          </FormSection>
          <SettingsActions
            canManage={canManage}
            submitting={submitting}
            dirty={dirty}
            onReset={() => {
              setValues(DEFAULT_PAYMENTS_SETTINGS);
              setSaved(false);
            }}
          />
        </form>
      )}
    </div>
  );
}
