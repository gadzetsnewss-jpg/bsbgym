import type { Json } from "@/lib/supabase/types";
import { PAYMENT_METHODS, PAYMENT_METHOD_LABELS, type PaymentMethod } from "@/lib/billing/types";
import { settingValueAsRecord } from "@/lib/org/settings";

export const SETTINGS_KEYS = {
  invoice: "invoice",
  taxGst: "tax_gst",
  regional: "regional",
  payments: "payments",
  membership: "membership",
  print: "print",
  notifications: "notifications",
} as const;

export const PRODUCT_FOOTER = "Powered by BSB FitForge";

export type TaxMode = "exclusive" | "inclusive";
export type RoundingPolicy = "none" | "nearest" | "up" | "down";
export type PaperSize =
  | "a4"
  | "a5"
  | "letter"
  | "legal"
  | "ledger"
  | "thermal_58"
  | "thermal_80"
  | "custom";
export type PrintOrientation = "portrait" | "landscape";
export type PrintTemplate = "standard" | "compact" | "detailed" | "thermal";
export type TimeFormat = "12h" | "24h";
export type FirstDayOfWeek = "sunday" | "monday";
export type MembershipStartBehavior = "today" | "invoice_date" | "plan_start";
export type IssueDateBehavior = "today" | "blank";

export interface InvoiceSettings {
  prefix: string;
  nextNumber: number;
  padding: number;
  includeGstin: boolean;
  footerNote: string;
  terms: string;
  dueDays: number;
  paymentTerms: string;
  defaultNotes: string;
  defaultPaymentMethod: PaymentMethod;
  roundOffBehavior: RoundingPolicy;
  issueDateBehavior: IssueDateBehavior;
  defaultBranchId: string;
}

export interface TaxGstSettings {
  gstRegistered: boolean;
  gstin: string;
  defaultGstRate: "0" | "5" | "12" | "18" | "28";
  hsnSac: string;
  placeOfSupply: string;
  reverseCharge: boolean;
  taxMode: TaxMode;
  roundingPolicy: RoundingPolicy;
  decimalPlaces: number;
}

export interface RegionalSettings {
  currency: string;
  timezone: string;
  dateFormat: string;
  currencySymbol: string;
  decimalPlaces: number;
  thousandSeparator: string;
  decimalSeparator: string;
  timeFormat: TimeFormat;
  firstDayOfWeek: FirstDayOfWeek;
}

export interface PaymentMethodSetting {
  code: PaymentMethod;
  enabled: boolean;
  sortOrder: number;
  requireReference: boolean;
  isDefault: boolean;
}

export interface PaymentsSettings {
  methods: PaymentMethodSetting[];
}

export interface MembershipSettings {
  startDateBehavior: MembershipStartBehavior;
  extraMonthsDefault: number;
  extraDaysDefault: number;
  freezeDefaultDays: number;
  trainerAssignOnConvert: boolean;
}

export interface PrintFieldVisibility {
  logo: boolean;
  gstin: boolean;
  address: boolean;
  phoneEmail: boolean;
  memberAddress: boolean;
  payments: boolean;
  taxBreakup: boolean;
  discount: boolean;
  terms: boolean;
  signature: boolean;
  productFooter: boolean;
}

export interface PrintSettings {
  paperSize: PaperSize;
  orientation: PrintOrientation;
  template: PrintTemplate;
  customWidthMm: number;
  customHeightMm: number;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  scale: number;
  fontSize: number;
  lineSpacing: number;
  headerSpacing: number;
  footerSpacing: number;
  logoSize: number;
  footerText: string;
  fields: PrintFieldVisibility;
}

export interface NotificationSettings {
  invoiceMessage: string;
  paymentReceiptMessage: string;
  membershipExpiryReminder: string;
  followUpDefaultNotes: string;
  emailEnabled: boolean;
  whatsappEnabled: boolean;
}

export interface PaperProfile {
  id: PaperSize;
  label: string;
  widthMm: number;
  heightMm: number;
  continuous: boolean;
}

export const PAPER_PROFILES: Record<PaperSize, PaperProfile> = {
  a4: { id: "a4", label: "A4", widthMm: 210, heightMm: 297, continuous: false },
  a5: { id: "a5", label: "A5", widthMm: 148, heightMm: 210, continuous: false },
  letter: { id: "letter", label: "Letter", widthMm: 216, heightMm: 279, continuous: false },
  legal: { id: "legal", label: "Legal", widthMm: 216, heightMm: 356, continuous: false },
  ledger: { id: "ledger", label: "Ledger", widthMm: 432, heightMm: 279, continuous: false },
  thermal_58: { id: "thermal_58", label: "Thermal 58mm", widthMm: 58, heightMm: 0, continuous: true },
  thermal_80: { id: "thermal_80", label: "Thermal 80mm", widthMm: 80, heightMm: 0, continuous: true },
  custom: { id: "custom", label: "Custom", widthMm: 210, heightMm: 297, continuous: false },
};

export const DEFAULT_INVOICE_SETTINGS: InvoiceSettings = {
  prefix: "INV",
  nextNumber: 1,
  padding: 4,
  includeGstin: true,
  footerNote: "",
  terms: "",
  dueDays: 0,
  paymentTerms: "",
  defaultNotes: "",
  defaultPaymentMethod: "upi",
  roundOffBehavior: "none",
  issueDateBehavior: "today",
  defaultBranchId: "",
};

export const DEFAULT_TAX_GST_SETTINGS: TaxGstSettings = {
  gstRegistered: false,
  gstin: "",
  defaultGstRate: "18",
  hsnSac: "",
  placeOfSupply: "",
  reverseCharge: false,
  taxMode: "exclusive",
  roundingPolicy: "nearest",
  decimalPlaces: 2,
};

export const DEFAULT_REGIONAL_SETTINGS: RegionalSettings = {
  currency: "INR",
  timezone: "Asia/Kolkata",
  dateFormat: "DD/MM/YYYY",
  currencySymbol: "",
  decimalPlaces: 2,
  thousandSeparator: ",",
  decimalSeparator: ".",
  timeFormat: "12h",
  firstDayOfWeek: "monday",
};

export const DEFAULT_PAYMENTS_SETTINGS: PaymentsSettings = {
  methods: PAYMENT_METHODS.map((code, index) => ({
    code,
    enabled: true,
    sortOrder: index,
    requireReference: code !== "cash",
    isDefault: code === "upi",
  })),
};

export const DEFAULT_MEMBERSHIP_SETTINGS: MembershipSettings = {
  startDateBehavior: "today",
  extraMonthsDefault: 0,
  extraDaysDefault: 0,
  freezeDefaultDays: 0,
  trainerAssignOnConvert: false,
};

export const DEFAULT_PRINT_SETTINGS: PrintSettings = {
  paperSize: "a4",
  orientation: "portrait",
  template: "standard",
  customWidthMm: 210,
  customHeightMm: 297,
  marginTopMm: 12,
  marginRightMm: 12,
  marginBottomMm: 12,
  marginLeftMm: 12,
  scale: 100,
  fontSize: 12,
  lineSpacing: 1.35,
  headerSpacing: 16,
  footerSpacing: 16,
  logoSize: 64,
  footerText: "",
  fields: {
    logo: true,
    gstin: true,
    address: true,
    phoneEmail: true,
    memberAddress: true,
    payments: true,
    taxBreakup: true,
    discount: true,
    terms: true,
    signature: false,
    productFooter: true,
  },
};

export const DEFAULT_NOTIFICATION_SETTINGS: NotificationSettings = {
  invoiceMessage: "Your invoice {invoiceNumber} for {amount} is ready.",
  paymentReceiptMessage: "Payment of {amount} received for invoice {invoiceNumber}.",
  membershipExpiryReminder: "Membership for {memberName} expires on {endDate}.",
  followUpDefaultNotes: "",
  emailEnabled: false,
  whatsappEnabled: false,
};

function asString(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export function parseInvoiceSettings(value: Json | null | undefined): InvoiceSettings {
  const record = settingValueAsRecord(value);
  const method = asString(record.defaultPaymentMethod, DEFAULT_INVOICE_SETTINGS.defaultPaymentMethod);
  const roundOff = asString(record.roundOffBehavior, DEFAULT_INVOICE_SETTINGS.roundOffBehavior);
  const issue = asString(record.issueDateBehavior, DEFAULT_INVOICE_SETTINGS.issueDateBehavior);
  return {
    prefix: asString(record.prefix, DEFAULT_INVOICE_SETTINGS.prefix) || DEFAULT_INVOICE_SETTINGS.prefix,
    nextNumber: Math.max(1, asNumber(record.nextNumber, DEFAULT_INVOICE_SETTINGS.nextNumber)),
    padding: Math.min(8, Math.max(1, asNumber(record.padding, DEFAULT_INVOICE_SETTINGS.padding))),
    includeGstin: asBoolean(record.includeGstin, DEFAULT_INVOICE_SETTINGS.includeGstin),
    footerNote: asString(record.footerNote, ""),
    terms: asString(record.terms, ""),
    dueDays: Math.max(0, asNumber(record.dueDays, DEFAULT_INVOICE_SETTINGS.dueDays)),
    paymentTerms: asString(record.paymentTerms, ""),
    defaultNotes: asString(record.defaultNotes, ""),
    defaultPaymentMethod: PAYMENT_METHODS.includes(method as PaymentMethod)
      ? (method as PaymentMethod)
      : DEFAULT_INVOICE_SETTINGS.defaultPaymentMethod,
    roundOffBehavior: ["none", "nearest", "up", "down"].includes(roundOff)
      ? (roundOff as RoundingPolicy)
      : DEFAULT_INVOICE_SETTINGS.roundOffBehavior,
    issueDateBehavior: issue === "blank" ? "blank" : "today",
    defaultBranchId: asString(record.defaultBranchId, ""),
  };
}

export function parseTaxGstSettings(
  value: Json | null | undefined,
  orgGstin?: string | null,
): TaxGstSettings {
  const record = settingValueAsRecord(value);
  const rate = asString(record.defaultGstRate, DEFAULT_TAX_GST_SETTINGS.defaultGstRate);
  const allowed = ["0", "5", "12", "18", "28"].includes(rate);
  const rounding = asString(record.roundingPolicy, DEFAULT_TAX_GST_SETTINGS.roundingPolicy);
  return {
    gstRegistered: asBoolean(record.gstRegistered, Boolean(orgGstin)),
    gstin: asString(record.gstin, orgGstin ?? ""),
    defaultGstRate: (allowed ? rate : DEFAULT_TAX_GST_SETTINGS.defaultGstRate) as TaxGstSettings["defaultGstRate"],
    hsnSac: asString(record.hsnSac, ""),
    placeOfSupply: asString(record.placeOfSupply, ""),
    reverseCharge: asBoolean(record.reverseCharge, false),
    taxMode: record.taxMode === "inclusive" ? "inclusive" : "exclusive",
    roundingPolicy: ["none", "nearest", "up", "down"].includes(rounding)
      ? (rounding as RoundingPolicy)
      : DEFAULT_TAX_GST_SETTINGS.roundingPolicy,
    decimalPlaces: Math.min(4, Math.max(0, asNumber(record.decimalPlaces, DEFAULT_TAX_GST_SETTINGS.decimalPlaces))),
  };
}

export function parseRegionalSettings(
  value: Json | null | undefined,
  org?: { currency?: string; timezone?: string; dateFormat?: string } | null,
): RegionalSettings {
  const record = settingValueAsRecord(value);
  const timeFormat = asString(record.timeFormat, DEFAULT_REGIONAL_SETTINGS.timeFormat);
  const firstDay = asString(record.firstDayOfWeek, DEFAULT_REGIONAL_SETTINGS.firstDayOfWeek);
  return {
    currency: asString(record.currency, org?.currency ?? DEFAULT_REGIONAL_SETTINGS.currency),
    timezone: asString(record.timezone, org?.timezone ?? DEFAULT_REGIONAL_SETTINGS.timezone),
    dateFormat: asString(record.dateFormat, org?.dateFormat ?? DEFAULT_REGIONAL_SETTINGS.dateFormat),
    currencySymbol: asString(record.currencySymbol, ""),
    decimalPlaces: Math.min(4, Math.max(0, asNumber(record.decimalPlaces, DEFAULT_REGIONAL_SETTINGS.decimalPlaces))),
    thousandSeparator: asString(record.thousandSeparator, DEFAULT_REGIONAL_SETTINGS.thousandSeparator) || ",",
    decimalSeparator: asString(record.decimalSeparator, DEFAULT_REGIONAL_SETTINGS.decimalSeparator) || ".",
    timeFormat: timeFormat === "24h" ? "24h" : "12h",
    firstDayOfWeek: firstDay === "sunday" ? "sunday" : "monday",
  };
}

export function parsePaymentsSettings(value: Json | null | undefined): PaymentsSettings {
  const record = settingValueAsRecord(value);
  const rows = Array.isArray(record.methods) ? record.methods : [];
  const byCode = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    if (row && typeof row === "object" && !Array.isArray(row) && typeof row.code === "string") {
      byCode.set(row.code, row as Record<string, unknown>);
    }
  }
  const methods = PAYMENT_METHODS.map((code, index) => {
    const saved = byCode.get(code);
    const fallback = DEFAULT_PAYMENTS_SETTINGS.methods[index];
    return {
      code,
      enabled: saved ? asBoolean(saved.enabled, true) : fallback.enabled,
      sortOrder: saved ? asNumber(saved.sortOrder, index) : fallback.sortOrder,
      requireReference: saved ? asBoolean(saved.requireReference, fallback.requireReference) : fallback.requireReference,
      isDefault: saved ? asBoolean(saved.isDefault, fallback.isDefault) : fallback.isDefault,
    };
  }).sort((a, b) => a.sortOrder - b.sortOrder);
  if (!methods.some((method) => method.enabled && method.isDefault)) {
    const first = methods.find((method) => method.enabled) ?? methods[0];
    if (first) first.isDefault = true;
  }
  return { methods };
}

export function parseMembershipSettings(value: Json | null | undefined): MembershipSettings {
  const record = settingValueAsRecord(value);
  const start = asString(record.startDateBehavior, DEFAULT_MEMBERSHIP_SETTINGS.startDateBehavior);
  return {
    startDateBehavior:
      start === "invoice_date" || start === "plan_start" ? start : "today",
    extraMonthsDefault: Math.max(0, asNumber(record.extraMonthsDefault, 0)),
    extraDaysDefault: Math.max(0, asNumber(record.extraDaysDefault, 0)),
    freezeDefaultDays: Math.max(0, asNumber(record.freezeDefaultDays, 0)),
    trainerAssignOnConvert: asBoolean(record.trainerAssignOnConvert, false),
  };
}

export function parsePrintSettings(value: Json | null | undefined): PrintSettings {
  const record = settingValueAsRecord(value);
  const paper = asString(record.paperSize, DEFAULT_PRINT_SETTINGS.paperSize);
  const orientation = asString(record.orientation, DEFAULT_PRINT_SETTINGS.orientation);
  const template = asString(record.template, DEFAULT_PRINT_SETTINGS.template);
  const fieldsRecord =
    record.fields && typeof record.fields === "object" && !Array.isArray(record.fields)
      ? (record.fields as Record<string, unknown>)
      : {};
  const defaults = DEFAULT_PRINT_SETTINGS.fields;
  return {
    paperSize: paper in PAPER_PROFILES ? (paper as PaperSize) : "a4",
    orientation: orientation === "landscape" ? "landscape" : "portrait",
    template:
      template === "compact" || template === "detailed" || template === "thermal"
        ? template
        : "standard",
    customWidthMm: Math.max(40, asNumber(record.customWidthMm, DEFAULT_PRINT_SETTINGS.customWidthMm)),
    customHeightMm: Math.max(0, asNumber(record.customHeightMm, DEFAULT_PRINT_SETTINGS.customHeightMm)),
    marginTopMm: Math.max(0, asNumber(record.marginTopMm, DEFAULT_PRINT_SETTINGS.marginTopMm)),
    marginRightMm: Math.max(0, asNumber(record.marginRightMm, DEFAULT_PRINT_SETTINGS.marginRightMm)),
    marginBottomMm: Math.max(0, asNumber(record.marginBottomMm, DEFAULT_PRINT_SETTINGS.marginBottomMm)),
    marginLeftMm: Math.max(0, asNumber(record.marginLeftMm, DEFAULT_PRINT_SETTINGS.marginLeftMm)),
    scale: Math.min(150, Math.max(50, asNumber(record.scale, DEFAULT_PRINT_SETTINGS.scale))),
    fontSize: Math.min(18, Math.max(8, asNumber(record.fontSize, DEFAULT_PRINT_SETTINGS.fontSize))),
    lineSpacing: Math.min(2, Math.max(1, asNumber(record.lineSpacing, DEFAULT_PRINT_SETTINGS.lineSpacing))),
    headerSpacing: Math.max(0, asNumber(record.headerSpacing, DEFAULT_PRINT_SETTINGS.headerSpacing)),
    footerSpacing: Math.max(0, asNumber(record.footerSpacing, DEFAULT_PRINT_SETTINGS.footerSpacing)),
    logoSize: Math.min(128, Math.max(24, asNumber(record.logoSize, DEFAULT_PRINT_SETTINGS.logoSize))),
    footerText: asString(record.footerText, ""),
    fields: {
      logo: asBoolean(fieldsRecord.logo, defaults.logo),
      gstin: asBoolean(fieldsRecord.gstin, defaults.gstin),
      address: asBoolean(fieldsRecord.address, defaults.address),
      phoneEmail: asBoolean(fieldsRecord.phoneEmail, defaults.phoneEmail),
      memberAddress: asBoolean(fieldsRecord.memberAddress, defaults.memberAddress),
      payments: asBoolean(fieldsRecord.payments, defaults.payments),
      taxBreakup: asBoolean(fieldsRecord.taxBreakup, defaults.taxBreakup),
      discount: asBoolean(fieldsRecord.discount, defaults.discount),
      terms: asBoolean(fieldsRecord.terms, defaults.terms),
      signature: asBoolean(fieldsRecord.signature, defaults.signature),
      productFooter: asBoolean(fieldsRecord.productFooter, defaults.productFooter),
    },
  };
}

export function parseNotificationSettings(value: Json | null | undefined): NotificationSettings {
  const record = settingValueAsRecord(value);
  return {
    invoiceMessage: asString(record.invoiceMessage, DEFAULT_NOTIFICATION_SETTINGS.invoiceMessage),
    paymentReceiptMessage: asString(
      record.paymentReceiptMessage,
      DEFAULT_NOTIFICATION_SETTINGS.paymentReceiptMessage,
    ),
    membershipExpiryReminder: asString(
      record.membershipExpiryReminder,
      DEFAULT_NOTIFICATION_SETTINGS.membershipExpiryReminder,
    ),
    followUpDefaultNotes: asString(record.followUpDefaultNotes, ""),
    emailEnabled: asBoolean(record.emailEnabled, false),
    whatsappEnabled: asBoolean(record.whatsappEnabled, false),
  };
}

export function enabledPaymentMethods(settings: PaymentsSettings): PaymentMethodSetting[] {
  return settings.methods.filter((method) => method.enabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function defaultPaymentMethod(settings: PaymentsSettings): PaymentMethod {
  const enabled = enabledPaymentMethods(settings);
  return enabled.find((method) => method.isDefault)?.code ?? enabled[0]?.code ?? "cash";
}

export function paymentMethodLabel(code: string): string {
  return PAYMENT_METHOD_LABELS[code] ?? code;
}

export function paymentMethodRequiresReference(
  settings: PaymentsSettings,
  code: string,
): boolean {
  return settings.methods.find((method) => method.code === code)?.requireReference ?? false;
}

export function resolvedPaper(print: PrintSettings): { widthMm: number; heightMm: number; continuous: boolean } {
  if (print.paperSize === "custom") {
    return {
      widthMm: print.customWidthMm,
      heightMm: print.customHeightMm,
      continuous: print.customHeightMm <= 0,
    };
  }
  const profile = PAPER_PROFILES[print.paperSize];
  return { widthMm: profile.widthMm, heightMm: profile.heightMm, continuous: profile.continuous };
}

export function isThermalPaper(paperSize: PaperSize): boolean {
  return paperSize === "thermal_58" || paperSize === "thermal_80";
}

export function effectivePrintTemplate(print: PrintSettings): PrintTemplate {
  if (isThermalPaper(print.paperSize)) return "thermal";
  return print.template;
}

export function addDaysIso(isoDate: string, days: number): string {
  if (!isoDate || !Number.isFinite(days) || days === 0) return isoDate;
  const date = new Date(`${isoDate}T00:00:00`);
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function applyRoundOff(amount: number, policy: RoundingPolicy): number {
  if (!Number.isFinite(amount) || policy === "none") return 0;
  const rounded =
    policy === "up" ? Math.ceil(amount) : policy === "down" ? Math.floor(amount) : Math.round(amount);
  return Math.round((rounded - amount + Number.EPSILON) * 100) / 100;
}

export function mergeBranchOverride<T extends object>(
  organization: T,
  branch: Partial<T> | null | undefined,
): T {
  if (!branch) return organization;
  return { ...organization, ...branch };
}

export type SettingsCategoryId =
  | "general"
  | "business"
  | "branches"
  | "tax"
  | "locale"
  | "membership"
  | "billing"
  | "payments"
  | "print"
  | "notifications"
  | "security";

export interface SettingsCategory {
  id: SettingsCategoryId;
  title: string;
  description: string;
  keywords: string;
  href: string;
  permission: string;
}

export const SETTINGS_CATEGORIES: SettingsCategory[] = [
  {
    id: "general",
    title: "General",
    description: "Workspace defaults used across the product.",
    keywords: "general profile account",
    href: "/settings/general",
    permission: "settings.view",
  },
  {
    id: "business",
    title: "Business",
    description: "Legal name, logo, address and GSTIN.",
    keywords: "business organization logo gstin address phone email website",
    href: "/settings/organization",
    permission: "organization.manage",
  },
  {
    id: "branches",
    title: "Branches",
    description: "Locations and branch overrides.",
    keywords: "branch location gst invoice numbering",
    href: "/settings/branches",
    permission: "branches.view",
  },
  {
    id: "tax",
    title: "Tax & GST",
    description: "Tax mode, rates and place of supply.",
    keywords: "gst tax cgst sgst igst inclusive exclusive rounding",
    href: "/settings/tax-gst",
    permission: "gst.view",
  },
  {
    id: "locale",
    title: "Currency & Locale",
    description: "Currency, date, time and number formats.",
    keywords: "currency timezone date format locale symbol",
    href: "/settings/general",
    permission: "settings.view",
  },
  {
    id: "membership",
    title: "Membership",
    description: "Start date, extra validity and freeze defaults.",
    keywords: "membership freeze extra validity trainer",
    href: "/settings/membership",
    permission: "settings.view",
  },
  {
    id: "billing",
    title: "Billing & Invoicing",
    description: "Numbering, due days, notes and round-off.",
    keywords: "invoice prefix numbering due terms notes",
    href: "/settings/invoice-settings",
    permission: "settings.view",
  },
  {
    id: "payments",
    title: "Payments",
    description: "Active methods, order and reference rules.",
    keywords: "payment upi cash card split",
    href: "/settings/payments",
    permission: "settings.view",
  },
  {
    id: "print",
    title: "Print & Documents",
    description: "Paper size, template and field visibility.",
    keywords: "print a4 thermal 80mm invoice receipt template",
    href: "/settings/print",
    permission: "settings.view",
  },
  {
    id: "notifications",
    title: "Notifications",
    description: "Invoice, receipt and reminder message defaults.",
    keywords: "notification email whatsapp reminder",
    href: "/settings/notifications",
    permission: "settings.view",
  },
  {
    id: "security",
    title: "Security & Permissions",
    description: "Users, roles and access control.",
    keywords: "users roles permissions security",
    href: "/settings/users-roles",
    permission: "users.view",
  },
];
