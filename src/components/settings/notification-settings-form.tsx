"use client";

import * as React from "react";
import { PageHeader } from "@/components/ui/page-header";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { fetchOrganizationSetting, upsertOrganizationSetting } from "@/lib/org/settings";
import {
  DEFAULT_NOTIFICATION_SETTINGS,
  SETTINGS_KEYS,
  parseNotificationSettings,
  type NotificationSettings,
} from "@/lib/org/settings-catalog";
import { notificationSettingsSchema } from "@/lib/validation/settings-schemas";
import { SettingsActions, SettingsSavedBanner, SettingsViewOnly } from "@/components/settings/settings-form-chrome";

export function NotificationSettingsForm() {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("settings.manage") || can("organization.manage");
  const orgId = organization?.id;
  const [values, setValues] = React.useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
  const [baseline, setBaseline] = React.useState<NotificationSettings>(DEFAULT_NOTIFICATION_SETTINGS);
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
    const result = await fetchOrganizationSetting(orgId, SETTINGS_KEYS.notifications);
    setLoading(false);
    if (result.error) {
      setLoadError(result.error.message);
      return;
    }
    const parsed = parseNotificationSettings(result.data);
    setValues(parsed);
    setBaseline(parsed);
  }, [orgId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const dirty = JSON.stringify(values) !== JSON.stringify(baseline);
  const setField = <K extends keyof NotificationSettings>(field: K, value: NotificationSettings[K]) => {
    setSaved(false);
    setValues((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage || !organization) return;
    const parsed = notificationSettingsSchema.safeParse(values);
    if (!parsed.success) {
      toast({ title: "Check the notification defaults", variant: "error" });
      return;
    }
    setSubmitting(true);
    const result = await upsertOrganizationSetting(organization.id, SETTINGS_KEYS.notifications, parsed.data);
    setSubmitting(false);
    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }
    setValues(parsed.data);
    setBaseline(parsed.data);
    setSaved(true);
    toast({ title: "Notification defaults saved", variant: "success" });
  };

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader title="Notifications" description="Message templates for invoices, receipts and reminders." />
        <EmptyState
          title="Settings unavailable"
          description="Sign in with an organization to edit notification defaults."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Notifications"
        description="Templates only. Email and WhatsApp sending is not enabled in this task."
      />
      {!canManage && <SettingsViewOnly />}
      {loading ? (
        <LoadingState label="Loading notification defaults…" />
      ) : loadError ? (
        <ErrorState title="Could not load notification defaults" description={loadError} onRetry={() => void load()} />
      ) : (
        <form onSubmit={handleSubmit} noValidate className="space-y-5">
          <SettingsSavedBanner visible={saved} />
          <FormSection title="Messages" columns={1}>
            <FormField label="Invoice message" hint="Placeholders: {invoiceNumber} {amount} {memberName}">
              <Textarea
                rows={3}
                disabled={!canManage}
                value={values.invoiceMessage}
                onChange={(event) => setField("invoiceMessage", event.target.value)}
              />
            </FormField>
            <FormField label="Payment receipt message">
              <Textarea
                rows={3}
                disabled={!canManage}
                value={values.paymentReceiptMessage}
                onChange={(event) => setField("paymentReceiptMessage", event.target.value)}
              />
            </FormField>
            <FormField label="Membership expiry reminder">
              <Textarea
                rows={3}
                disabled={!canManage}
                value={values.membershipExpiryReminder}
                onChange={(event) => setField("membershipExpiryReminder", event.target.value)}
              />
            </FormField>
            <FormField label="Follow-up default notes">
              <Textarea
                rows={2}
                disabled={!canManage}
                value={values.followUpDefaultNotes}
                onChange={(event) => setField("followUpDefaultNotes", event.target.value)}
              />
            </FormField>
          </FormSection>
          <FormSection title="Channels" description="Flags only. No integration is built here." columns={1}>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={values.emailEnabled}
                disabled={!canManage}
                onChange={(event) => setField("emailEnabled", event.target.checked)}
              />
              <span>Use email templates when email sending exists</span>
            </label>
            <label className="flex items-start gap-2 text-sm">
              <Checkbox
                checked={values.whatsappEnabled}
                disabled={!canManage}
                onChange={(event) => setField("whatsappEnabled", event.target.checked)}
              />
              <span>Use WhatsApp templates when WhatsApp sending exists</span>
            </label>
          </FormSection>
          <SettingsActions
            canManage={canManage}
            submitting={submitting}
            dirty={dirty}
            onReset={() => {
              setValues(DEFAULT_NOTIFICATION_SETTINGS);
              setSaved(false);
            }}
          />
        </form>
      )}
    </div>
  );
}
