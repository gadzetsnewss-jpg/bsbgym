import { describe, expect, it } from "vitest";
import { notificationTone, safeNotificationHref } from "@/lib/notifications/types";

describe("safeNotificationHref", () => {
  it("keeps in-app paths", () => {
    expect(safeNotificationHref("/members/1")).toBe("/members/1");
    expect(safeNotificationHref("/billing/invoices/abc")).toBe("/billing/invoices/abc");
  });

  it("rejects external and protocol-relative URLs", () => {
    expect(safeNotificationHref("https://evil.example")).toBeNull();
    expect(safeNotificationHref("//evil.example")).toBeNull();
    expect(safeNotificationHref("javascript:alert(1)")).toBeNull();
    expect(safeNotificationHref("http://localhost/members")).toBeNull();
    expect(safeNotificationHref("")).toBeNull();
    expect(safeNotificationHref(null)).toBeNull();
  });
});

describe("notificationTone", () => {
  it("maps known types and defaults to info", () => {
    expect(notificationTone("warning")).toBe("warning");
    expect(notificationTone("danger")).toBe("danger");
    expect(notificationTone("success")).toBe("success");
    expect(notificationTone("expiry")).toBe("info");
  });
});
