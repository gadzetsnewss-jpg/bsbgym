import { z } from "zod";
import { PAYMENT_METHODS } from "@/lib/billing/types";
import {
  invoiceSettingsSchema as baseInvoiceSettingsSchema,
  taxGstSettingsSchema as baseTaxGstSettingsSchema,
} from "@/lib/validation/auth-schemas";

const paymentMethodEnum = z.enum(PAYMENT_METHODS);

export const invoiceSettingsSchema = baseInvoiceSettingsSchema;
export const taxGstSettingsSchema = baseTaxGstSettingsSchema;

export const regionalSettingsSchema = z.object({
  currency: z.string().min(1, "Currency is required"),
  timezone: z.string().min(1, "Timezone is required"),
  dateFormat: z.string().min(1, "Date format is required"),
  currencySymbol: z.string().trim().max(8),
  decimalPlaces: z.coerce.number().int().min(0).max(4),
  thousandSeparator: z.string().min(1).max(2),
  decimalSeparator: z.string().min(1).max(2),
  timeFormat: z.enum(["12h", "24h"]),
  firstDayOfWeek: z.enum(["sunday", "monday"]),
});

export const paymentsSettingsSchema = z
  .object({
    methods: z
      .array(
        z.object({
          code: paymentMethodEnum,
          enabled: z.boolean(),
          sortOrder: z.coerce.number().int().min(0).max(99),
          requireReference: z.boolean(),
          isDefault: z.boolean(),
        }),
      )
      .min(1),
  })
  .refine((values) => values.methods.some((method) => method.enabled), {
    message: "Enable at least one payment method",
    path: ["methods"],
  })
  .refine(
    (values) => values.methods.some((method) => method.enabled && method.isDefault),
    {
      message: "Choose a default from the enabled methods",
      path: ["methods"],
    },
  );

export const membershipSettingsSchema = z.object({
  startDateBehavior: z.enum(["today", "invoice_date", "plan_start"]),
  extraMonthsDefault: z.coerce.number().int().min(0).max(24),
  extraDaysDefault: z.coerce.number().int().min(0).max(365),
  freezeDefaultDays: z.coerce.number().int().min(0).max(365),
  trainerAssignOnConvert: z.boolean(),
});

export const printSettingsSchema = z.object({
  paperSize: z.enum(["a4", "a5", "letter", "legal", "ledger", "thermal_58", "thermal_80", "custom"]),
  orientation: z.enum(["portrait", "landscape"]),
  template: z.enum(["standard", "compact", "detailed", "thermal"]),
  customWidthMm: z.coerce.number().min(40).max(500),
  customHeightMm: z.coerce.number().min(0).max(800),
  marginTopMm: z.coerce.number().min(0).max(40),
  marginRightMm: z.coerce.number().min(0).max(40),
  marginBottomMm: z.coerce.number().min(0).max(40),
  marginLeftMm: z.coerce.number().min(0).max(40),
  scale: z.coerce.number().int().min(50).max(150),
  fontSize: z.coerce.number().int().min(8).max(18),
  lineSpacing: z.coerce.number().min(1).max(2),
  headerSpacing: z.coerce.number().min(0).max(48),
  footerSpacing: z.coerce.number().min(0).max(48),
  logoSize: z.coerce.number().int().min(24).max(128),
  footerText: z.string().trim().max(240),
  fields: z.object({
    logo: z.boolean(),
    gstin: z.boolean(),
    address: z.boolean(),
    phoneEmail: z.boolean(),
    memberAddress: z.boolean(),
    payments: z.boolean(),
    taxBreakup: z.boolean(),
    discount: z.boolean(),
    terms: z.boolean(),
    signature: z.boolean(),
    productFooter: z.boolean(),
  }),
});

export const notificationSettingsSchema = z.object({
  invoiceMessage: z.string().trim().max(500),
  paymentReceiptMessage: z.string().trim().max(500),
  membershipExpiryReminder: z.string().trim().max(500),
  followUpDefaultNotes: z.string().trim().max(500),
  emailEnabled: z.boolean(),
  whatsappEnabled: z.boolean(),
});

export const branchOverrideSchema = z.object({
  useInvoiceOverride: z.boolean(),
  prefix: z
    .string()
    .trim()
    .max(12)
    .regex(/^$|^[A-Za-z0-9_-]+$/, "Only letters, numbers, dashes or underscores"),
  padding: z.coerce.number().int().min(1).max(8),
  usePrintOverride: z.boolean(),
  paperSize: z.enum(["a4", "a5", "letter", "legal", "ledger", "thermal_58", "thermal_80", "custom"]),
});
