import {
  fetchBranchSettings,
  fetchOrganizationSetting,
} from "@/lib/org/settings";
import type { OrgResult } from "@/lib/org/members";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_MEMBERSHIP_SETTINGS,
  DEFAULT_PAYMENTS_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  DEFAULT_REGIONAL_SETTINGS,
  DEFAULT_TAX_GST_SETTINGS,
  SETTINGS_KEYS,
  applyRoundOff,
  defaultPaymentMethod,
  enabledPaymentMethods,
  parseInvoiceSettings,
  parseMembershipSettings,
  parsePaymentsSettings,
  parsePrintSettings,
  parseRegionalSettings,
  parseTaxGstSettings,
  type InvoiceSettings,
  type MembershipSettings,
  type PaperSize,
  type PaymentsSettings,
  type PrintSettings,
  type RegionalSettings,
  type TaxGstSettings,
} from "@/lib/org/settings-catalog";
import type { Json } from "@/lib/supabase/types";

export { applyRoundOff, defaultPaymentMethod, enabledPaymentMethods };

export interface OrgSettingsBundle {
  invoice: InvoiceSettings;
  tax: TaxGstSettings;
  payments: PaymentsSettings;
  membership: MembershipSettings;
  print: PrintSettings;
  regional: RegionalSettings;
}

export function emptyOrgSettingsBundle(): OrgSettingsBundle {
  return {
    invoice: DEFAULT_INVOICE_SETTINGS,
    tax: DEFAULT_TAX_GST_SETTINGS,
    payments: DEFAULT_PAYMENTS_SETTINGS,
    membership: DEFAULT_MEMBERSHIP_SETTINGS,
    print: DEFAULT_PRINT_SETTINGS,
    regional: DEFAULT_REGIONAL_SETTINGS,
  };
}

export async function fetchOrgSettingsBundle(
  organizationId: string,
  orgGstin?: string | null,
  orgRegional?: { currency?: string; timezone?: string; dateFormat?: string } | null,
): Promise<OrgResult<OrgSettingsBundle>> {
  const [invoice, tax, payments, membership, print, regional] = await Promise.all([
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.invoice),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.taxGst),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.payments),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.membership),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.print),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.regional),
  ]);
  const error =
    invoice.error ?? tax.error ?? payments.error ?? membership.error ?? print.error ?? regional.error;
  if (error) return { data: null, error };
  return {
    data: {
      invoice: parseInvoiceSettings(invoice.data),
      tax: parseTaxGstSettings(tax.data, orgGstin),
      payments: parsePaymentsSettings(payments.data),
      membership: parseMembershipSettings(membership.data),
      print: parsePrintSettings(print.data),
      regional: parseRegionalSettings(regional.data, orgRegional),
    },
    error: null,
  };
}

export interface BranchOverrideFlags {
  invoice: { useOverride: boolean; prefix: string; padding: number };
  print: { useOverride: boolean; paperSize: PaperSize };
}

export function parseBranchOverrideFlags(rows: { key: string; value: Json }[]): BranchOverrideFlags {
  const invoiceRow = rows.find((row) => row.key === SETTINGS_KEYS.invoice)?.value;
  const printRow = rows.find((row) => row.key === SETTINGS_KEYS.print)?.value;
  const invoice = parseInvoiceSettings(invoiceRow);
  const print = parsePrintSettings(printRow);
  const invoiceRecord =
    invoiceRow && typeof invoiceRow === "object" && !Array.isArray(invoiceRow)
      ? (invoiceRow as Record<string, unknown>)
      : {};
  const printRecord =
    printRow && typeof printRow === "object" && !Array.isArray(printRow)
      ? (printRow as Record<string, unknown>)
      : {};
  return {
    invoice: {
      useOverride: invoiceRecord.useOverride === true,
      prefix: invoice.prefix,
      padding: invoice.padding,
    },
    print: {
      useOverride: printRecord.useOverride === true,
      paperSize: print.paperSize,
    },
  };
}

export function applyBranchPrintOverride(orgPrint: PrintSettings, flags: BranchOverrideFlags): PrintSettings {
  if (!flags.print.useOverride) return orgPrint;
  return { ...orgPrint, paperSize: flags.print.paperSize };
}

export async function fetchPrintConfigForBranch(
  organizationId: string,
  branchId?: string | null,
): Promise<OrgResult<{ invoice: InvoiceSettings; print: PrintSettings }>> {
  const [invoice, print, branch] = await Promise.all([
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.invoice),
    fetchOrganizationSetting(organizationId, SETTINGS_KEYS.print),
    branchId ? fetchBranchSettings(organizationId, branchId) : Promise.resolve({ data: [], error: null }),
  ]);
  const error = invoice.error ?? print.error ?? branch.error;
  if (error) return { data: null, error };
  const orgInvoice = parseInvoiceSettings(invoice.data);
  const orgPrint = parsePrintSettings(print.data);
  const flags = parseBranchOverrideFlags(branch.data ?? []);
  return {
    data: {
      invoice: flags.invoice.useOverride
        ? { ...orgInvoice, prefix: flags.invoice.prefix, padding: flags.invoice.padding }
        : orgInvoice,
      print: applyBranchPrintOverride(orgPrint, flags),
    },
    error: null,
  };
}
