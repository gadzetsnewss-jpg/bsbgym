"use client";

import * as React from "react";
import { useOrganization } from "@/components/auth/org-provider";
import {
  emptyOrgSettingsBundle,
  enabledPaymentMethods,
  defaultPaymentMethod,
  fetchOrgSettingsBundle,
  type OrgSettingsBundle,
} from "@/lib/org/resolved-settings";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS } from "@/lib/billing/types";
import { formatCurrencyWithDecimals, formatDatePattern } from "@/lib/format";
import type { SelectOption } from "@/components/ui/select";

/**
 * Shared finance presentation preferences from Global Settings.
 * Currency, decimal precision and date pattern are never hardcoded here.
 * A module-level promise cache avoids re-fetching the bundle for every card.
 */
let cache: { key: string; promise: ReturnType<typeof fetchOrgSettingsBundle> } | null = null;

function loadsSettings(
  organizationId: string,
  organization?: { gstin?: string | null; currency?: string | null; timezone?: string | null; dateFormat?: string | null } | null,
) {
  const key = `${organizationId}:${organization?.currency ?? ""}:${organization?.dateFormat ?? ""}`;
  if (!cache || cache.key !== key) {
    cache = {
      key,
      promise: fetchOrgSettingsBundle(organizationId, organization?.gstin, {
        currency: organization?.currency ?? undefined,
        timezone: organization?.timezone ?? undefined,
        dateFormat: organization?.dateFormat ?? undefined,
      }),
    };
  }
  return cache.promise;
}

export function useFinanceSettings() {
  const { organization } = useOrganization();
  const orgId = organization?.id;
  const [bundle, setBundle] = React.useState<OrgSettingsBundle>(emptyOrgSettingsBundle());
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    if (!orgId) return;
    let active = true;
    void loadsSettings(orgId, organization).then((result) => {
      if (!active) return;
      if (result.data) setBundle(result.data);
      setReady(true);
    });
    return () => {
      active = false;
    };
  }, [orgId, organization]);

  const currency = bundle.regional.currency || organization?.currency || "INR";
  const dateFormat = bundle.regional.dateFormat || organization?.dateFormat || "DD/MM/YYYY";
  const decimalPlaces = bundle.regional.decimalPlaces ?? 2;

  const enabled = React.useMemo(
    () =>
      enabledPaymentMethods(bundle.payments)
        .map((method) => method.code)
        .filter((code): code is (typeof PAYMENT_METHODS)[number] =>
          (PAYMENT_METHODS as readonly string[]).includes(code),
        ),
    [bundle.payments],
  );

  const methodCodes = enabled.length ? enabled : [...PAYMENT_METHODS];
  const defaultMethod =
    methodCodes.find((code) => code === defaultPaymentMethod(bundle.payments)) ?? "cash";
  const paymentOptions: SelectOption[] = methodCodes.map((code) => ({
    value: code,
    label: PAYMENT_METHOD_LABELS[code] ?? code,
  }));

  const formatMoney = React.useCallback(
    (value: number | string | null | undefined) =>
      formatCurrencyWithDecimals(value, currency, decimalPlaces),
    [currency, decimalPlaces],
  );

  const formatDate = React.useCallback(
    (value: string | null | undefined) => formatDatePattern(value, dateFormat),
    [dateFormat],
  );

  return {
    settings: bundle,
    ready,
    currency,
    dateFormat,
    decimalPlaces,
    paymentOptions,
    defaultMethod,
    formatMoney,
    formatDate,
  };
}
