import { describe, expect, it } from "vitest";
import {
  DEFAULT_INVOICE_SETTINGS,
  DEFAULT_PAYMENTS_SETTINGS,
  DEFAULT_PRINT_SETTINGS,
  addDaysIso,
  applyRoundOff,
  defaultPaymentMethod,
  enabledPaymentMethods,
  effectivePrintTemplate,
  parseInvoiceSettings,
  parsePaymentsSettings,
  parsePrintSettings,
  parseTaxGstSettings,
  resolvedPaper,
} from "@/lib/org/settings-catalog";
import {
  membershipSettingsSchema,
  paymentsSettingsSchema,
  printSettingsSchema,
} from "@/lib/validation/settings-schemas";

describe("parseInvoiceSettings", () => {
  it("fills new billing defaults without dropping existing numbering keys", () => {
    const parsed = parseInvoiceSettings({
      prefix: "BOB",
      nextNumber: 12,
      padding: 5,
      includeGstin: false,
      footerNote: "Thanks",
      terms: "Net 7",
    });
    expect(parsed.prefix).toBe("BOB");
    expect(parsed.nextNumber).toBe(12);
    expect(parsed.dueDays).toBe(0);
    expect(parsed.roundOffBehavior).toBe("none");
    expect(parsed.defaultPaymentMethod).toBe("upi");
  });

  it("reads due days for new invoices", () => {
    expect(parseInvoiceSettings({ dueDays: 7 }).dueDays).toBe(7);
    expect(addDaysIso("2026-10-08", 7)).toBe("2026-10-15");
  });
});

describe("parseTaxGstSettings", () => {
  it("keeps tax mode in global settings, not the invoice form", () => {
    expect(parseTaxGstSettings({ taxMode: "inclusive" }).taxMode).toBe("inclusive");
    expect(parseTaxGstSettings({}).taxMode).toBe("exclusive");
  });
});

describe("payments settings", () => {
  it("requires at least one enabled default method", () => {
    expect(paymentsSettingsSchema.safeParse(DEFAULT_PAYMENTS_SETTINGS).success).toBe(true);
    expect(
      paymentsSettingsSchema.safeParse({
        methods: DEFAULT_PAYMENTS_SETTINGS.methods.map((method) => ({ ...method, enabled: false })),
      }).success,
    ).toBe(false);
  });

  it("exposes only enabled methods in display order", () => {
    const parsed = parsePaymentsSettings({
      methods: DEFAULT_PAYMENTS_SETTINGS.methods.map((method) => {
        if (method.code === "upi") return { ...method, enabled: true, sortOrder: 0, isDefault: true };
        if (method.code === "cash") return { ...method, enabled: true, sortOrder: 2, isDefault: false };
        return { ...method, enabled: false, isDefault: false };
      }),
    });
    expect(enabledPaymentMethods(parsed).map((method) => method.code)).toEqual(["upi", "cash"]);
    expect(defaultPaymentMethod(parsed)).toBe("upi");
  });
});

describe("print settings", () => {
  it("accepts A4 and 80mm thermal profiles", () => {
    expect(printSettingsSchema.safeParse(DEFAULT_PRINT_SETTINGS).success).toBe(true);
    const thermal = parsePrintSettings({ paperSize: "thermal_80", template: "standard" });
    expect(resolvedPaper(thermal)).toEqual({ widthMm: 80, heightMm: 0, continuous: true });
    expect(effectivePrintTemplate(thermal)).toBe("thermal");
  });

  it("restores field visibility defaults", () => {
    const parsed = parsePrintSettings({ fields: { logo: false, gstin: false } });
    expect(parsed.fields.logo).toBe(false);
    expect(parsed.fields.payments).toBe(true);
    expect(parsed.fields.productFooter).toBe(true);
  });
});

describe("membership and rounding", () => {
  it("accepts extra-validity defaults", () => {
    expect(
      membershipSettingsSchema.safeParse({
        startDateBehavior: "today",
        extraMonthsDefault: 1,
        extraDaysDefault: 5,
        freezeDefaultDays: 7,
        trainerAssignOnConvert: false,
      }).success,
    ).toBe(true);
  });

  it("computes round-off from the global policy", () => {
    expect(applyRoundOff(1179.4, "nearest")).toBe(-0.4);
    expect(applyRoundOff(1179.4, "none")).toBe(0);
    expect(applyRoundOff(1179.2, "down")).toBe(-0.2);
    expect(applyRoundOff(1179.6, "nearest")).toBe(0.4);
  });
});

describe("invoice schema compatibility", () => {
  it("still accepts the original invoice settings payload", () => {
    expect(
      parseInvoiceSettings({
        prefix: "INV",
        nextNumber: 1,
        padding: 4,
        includeGstin: true,
        footerNote: "",
        terms: "",
      }),
    ).toMatchObject(DEFAULT_INVOICE_SETTINGS);
  });
});
