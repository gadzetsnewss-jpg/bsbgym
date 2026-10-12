"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { CrmForm } from "@/components/crm/crm-screens";
import { useOrganization } from "@/components/auth/org-provider";
import type { ResourceValues } from "@/lib/crud/types";
import type { CrmResourceKey } from "@/lib/crm/resources";
import { fetchOrganizationSetting } from "@/lib/org/settings";
import {
  SETTINGS_KEYS,
  parseInvoiceSettings,
  parseNotificationSettings,
} from "@/lib/org/settings-catalog";
import { LoadingState } from "@/components/ui/loading-state";

const QUERY_FIELDS = ["leadId", "memberId", "branchId", "referrerMemberId", "assignedTo"] as const;

function splitName(value: string | null): { firstName?: string; lastName?: string } {
  if (!value) return {};
  const parts = value.trim().split(/\s+/);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { firstName: parts[0] };
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") };
}

function localDateTimeInHours(hoursFromNow: number): string {
  const date = new Date();
  date.setHours(date.getHours() + hoursFromNow, 0, 0, 0);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function localDatePlusDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function AddCrmForm({ resource }: { resource: CrmResourceKey }) {
  const searchParams = useSearchParams();
  const { organization, currentBranchId } = useOrganization();
  const orgId = organization?.id;
  const [settingsDefaults, setSettingsDefaults] = React.useState<ResourceValues | null>(null);

  React.useEffect(() => {
    if (!orgId) {
      setSettingsDefaults({});
      return;
    }
    let cancelled = false;
    void Promise.all([
      fetchOrganizationSetting(orgId, SETTINGS_KEYS.invoice),
      fetchOrganizationSetting(orgId, SETTINGS_KEYS.notifications),
    ]).then(([invoice, notifications]) => {
      if (cancelled) return;
      const invoiceSettings = parseInvoiceSettings(invoice.data);
      const notificationSettings = parseNotificationSettings(notifications.data);
      const next: ResourceValues = {};
      const defaultBranch = invoiceSettings.defaultBranchId || currentBranchId || "";
      if (resource === "leads" && defaultBranch) next.branchId = defaultBranch;
      if (resource === "follow_ups") {
        if (defaultBranch) next.branchId = defaultBranch;
        next.dueAt = localDateTimeInHours(24);
        if (notificationSettings.followUpDefaultNotes) {
          next.notes = notificationSettings.followUpDefaultNotes;
        }
      }
      if (resource === "trial_memberships") {
        if (defaultBranch) next.branchId = defaultBranch;
        next.startsOn = localDatePlusDays(0);
        next.endsOn = localDatePlusDays(7);
      }
      if (!next.branchId && defaultBranch && resource !== "referrals") {
        next.branchId = defaultBranch;
      }
      setSettingsDefaults(next);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId, resource, currentBranchId]);

  const queryDefaults: ResourceValues = {};
  for (const field of QUERY_FIELDS) {
    const value = searchParams.get(field);
    if (value) queryDefaults[field] = value;
  }
  const nameParts = splitName(searchParams.get("name"));
  if (nameParts.firstName) queryDefaults.firstName = nameParts.firstName;
  if (nameParts.lastName) queryDefaults.lastName = nameParts.lastName;
  const referredName = searchParams.get("referredName");
  if (referredName) queryDefaults.referredName = referredName;
  const phone = searchParams.get("phone");
  if (phone) queryDefaults.phone = phone;
  const email = searchParams.get("email");
  if (email) queryDefaults.email = email;

  if (settingsDefaults === null) {
    return <LoadingState label="Loading form…" />;
  }

  const defaults = { ...settingsDefaults, ...queryDefaults };

  return (
    <CrmForm
      resource={resource}
      mode="create"
      defaults={Object.keys(defaults).length > 0 ? defaults : undefined}
    />
  );
}
