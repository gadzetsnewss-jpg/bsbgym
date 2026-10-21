"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Minus, Plus, Search, ShoppingCart, Trash2, Wallet } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { createPosSale, loadPosProducts } from "@/lib/inventory/client";
import { loadMemberOptions } from "@/lib/operations/adapters";
import { roundMoney } from "@/lib/billing/gst";
import { POS_PAYMENT_METHOD_LABELS } from "@/lib/inventory/types";
import {
  defaultPaymentMethod,
  enabledPaymentMethods,
  fetchOrgSettingsBundle,
  emptyOrgSettingsBundle,
  type OrgSettingsBundle,
} from "@/lib/org/resolved-settings";
import type { ProductRow } from "@/lib/catalog/adapters";
import type { SelectOption } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";
import { cn } from "@/lib/utils";

const POS_ALLOWED_METHODS = ["cash", "card", "upi", "netbanking", "wallet", "other"] as const;

interface CartLine {
  productId: string;
  name: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  taxRate: number;
  trackStock: boolean;
  available: number;
}

export function PosSaleForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, currentBranchId } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const presetProduct = searchParams.get("product") ?? "";

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [memberOptions, setMemberOptions] = React.useState<SelectOption[]>([]);
  const [settings, setSettings] = React.useState<OrgSettingsBundle>(emptyOrgSettingsBundle());
  const [search, setSearch] = React.useState("");
  const [cart, setCart] = React.useState<CartLine[]>([]);
  const [branchId, setBranchId] = React.useState(currentBranchId ?? "");
  const [memberId, setMemberId] = React.useState("");
  const [paymentMethod, setPaymentMethod] = React.useState("cash");
  const [discount, setDiscount] = React.useState("0");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const presetApplied = React.useRef(false);

  React.useEffect(() => {
    if (!orgId) return;
    void loadPosProducts(orgId).then(setProducts);
    void loadMemberOptions(orgId).then(setMemberOptions);
    void fetchOrgSettingsBundle(orgId, organization?.gstin, {
      currency: organization?.currency,
      timezone: organization?.timezone,
      dateFormat: organization?.dateFormat,
    }).then((result) => {
      if (result.data) setSettings(result.data);
    });
  }, [orgId, organization?.gstin, organization?.currency, organization?.timezone, organization?.dateFormat]);

  React.useEffect(() => {
    if (!branchId && currentBranchId) setBranchId(currentBranchId);
  }, [branchId, currentBranchId]);

  const paymentOptions = React.useMemo(() => {
    const enabled = enabledPaymentMethods(settings.payments)
      .map((method) => method.code)
      .filter((code): code is (typeof POS_ALLOWED_METHODS)[number] =>
        (POS_ALLOWED_METHODS as readonly string[]).includes(code),
      );
    const codes = enabled.length ? enabled : ([defaultPaymentMethod(settings.payments)] as string[]).filter((c) =>
      (POS_ALLOWED_METHODS as readonly string[]).includes(c),
    );
    const safe = codes.length ? codes : ["cash"];
    return safe.map((code) => ({ value: code, label: POS_PAYMENT_METHOD_LABELS[code] ?? code }));
  }, [settings.payments]);

  React.useEffect(() => {
    if (!paymentOptions.some((option) => option.value === paymentMethod)) {
      setPaymentMethod(paymentOptions[0]?.value ?? "cash");
    }
  }, [paymentOptions, paymentMethod]);

  const taxMode = settings.tax.taxMode === "inclusive" ? "inclusive" : "exclusive";

  const filteredProducts = React.useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(term) ||
        (product.sku ?? "").toLowerCase().includes(term) ||
        (product.category ?? "").toLowerCase().includes(term),
    );
  }, [products, search]);

  const addToCart = (product: ProductRow) => {
    setCart((current) => {
      const existing = current.find((line) => line.productId === product.id);
      if (existing) {
        if (product.trackStock && existing.quantity + 1 > product.stockQuantity) return current;
        return current.map((line) =>
          line.productId === product.id ? { ...line, quantity: line.quantity + 1 } : line,
        );
      }
      if (product.trackStock && product.stockQuantity <= 0) return current;
      return [
        ...current,
        {
          productId: product.id,
          name: product.name,
          unit: product.unit,
          quantity: 1,
          unitPrice: product.salePrice,
          taxRate: product.taxRate,
          trackStock: product.trackStock,
          available: product.stockQuantity,
        },
      ];
    });
  };

  const setQuantity = (productId: string, quantity: number) => {
    setCart((current) =>
      current
        .map((line) => {
          if (line.productId !== productId) return line;
          const max = line.trackStock ? line.available : Number.POSITIVE_INFINITY;
          return { ...line, quantity: Math.min(Math.max(quantity, 0), max) };
        })
        .filter((line) => line.quantity > 0),
    );
  };

  const removeLine = (productId: string) => {
    setCart((current) => current.filter((line) => line.productId !== productId));
  };

  React.useEffect(() => {
    if (presetApplied.current || !presetProduct || products.length === 0) return;
    const product = products.find((item) => item.id === presetProduct);
    if (!product) return;
    presetApplied.current = true;
    addToCart(product);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetProduct, products]);

  const totals = React.useMemo(() => {
    let subTotal = 0;
    let taxTotal = 0;
    let lineSum = 0;
    cart.forEach((line) => {
      const gross = roundMoney(line.quantity * line.unitPrice);
      let gst: number;
      let lineTotal: number;
      if (taxMode === "inclusive" && line.taxRate > 0) {
        const taxable = roundMoney(gross / (1 + line.taxRate / 100));
        gst = roundMoney(gross - taxable);
        lineTotal = gross;
      } else {
        gst = roundMoney(gross * (line.taxRate / 100));
        lineTotal = roundMoney(gross + gst);
      }
      subTotal = roundMoney(subTotal + gross);
      taxTotal = roundMoney(taxTotal + gst);
      lineSum = roundMoney(lineSum + lineTotal);
    });
    const discountValue = roundMoney(Number(discount) || 0);
    const total = Math.max(roundMoney(lineSum - discountValue), 0);
    return { subTotal, taxTotal, discount: discountValue, total };
  }, [cart, taxMode, discount]);

  const canSubmit = cart.length > 0 && Boolean(branchId) && !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !canSubmit) return;
    setSubmitting(true);
    setError(null);
    const result = await createPosSale({
      organizationId: orgId,
      branchId,
      memberId: memberId || null,
      paymentMethod,
      discount: Number(discount) || 0,
      taxMode,
      notes: notes || null,
      items: cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    toast({ title: "Sale completed", description: "Stock updated.", variant: "success" });
    router.push(`/pos/sales/${result.data.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New sale"
        description="Ring up products and take payment."
        icon={ShoppingCart}
        actions={
          <ButtonLink href="/pos/sales" variant="outline">
            Sales history
          </ButtonLink>
        }
      />

      <form onSubmit={handleSubmit} className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Products</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="relative">
              <Search aria-hidden="true" className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-neutral-400" />
              <Input
                className="pl-9"
                placeholder="Search products by name or SKU"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                aria-label="Search products"
              />
            </div>

            {products.length === 0 ? (
              <EmptyState
                title="No products yet"
                description="Add products before using the POS."
                action={{ label: "Add product", href: "/inventory/products/add", variant: "outline" }}
              />
            ) : filteredProducts.length === 0 ? (
              <EmptyState title="No matching products" description="Try a different search." />
            ) : (
              <div className="grid max-h-[28rem] gap-2 overflow-y-auto sm:grid-cols-2">
                {filteredProducts.map((product) => {
                  const outOfStock = product.trackStock && product.stockQuantity <= 0;
                  return (
                    <button
                      key={product.id}
                      type="button"
                      disabled={outOfStock}
                      onClick={() => addToCart(product)}
                      className={cn(
                        "flex flex-col items-start gap-1 rounded-lg border border-border p-3 text-left transition-colors",
                        outOfStock
                          ? "cursor-not-allowed opacity-50"
                          : "hover:border-primary-300 hover:bg-primary-50/50",
                      )}
                    >
                      <span className="text-sm font-medium text-ink">{product.name}</span>
                      <span className="text-xs text-neutral-500">
                        {product.sku ? `${product.sku} · ` : ""}
                        {formatCurrency(product.salePrice, currency)}
                        {product.trackStock ? ` · ${product.stockQuantity} ${product.unit}` : ""}
                      </span>
                      {outOfStock && <Badge tone="danger">Out of stock</Badge>}
                    </button>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Cart</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {cart.length === 0 ? (
              <EmptyState title="Cart is empty" description="Tap a product to add it." />
            ) : (
              <div className="space-y-2">
                {cart.map((line) => (
                  <div key={line.productId} className="rounded-lg border border-border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-ink">{line.name}</p>
                        <p className="text-xs text-neutral-500">
                          {formatCurrency(line.unitPrice, currency)} · Tax {line.taxRate}%
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${line.name}`}
                        onClick={() => removeLine(line.productId)}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                    <div className="mt-2 flex items-center justify-between">
                      <div className="inline-flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Decrease quantity"
                          onClick={() => setQuantity(line.productId, line.quantity - 1)}
                        >
                          <Minus aria-hidden="true" className="size-4" />
                        </Button>
                        <Input
                          type="number"
                          className="w-20 text-center"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) => setQuantity(line.productId, Number(event.target.value))}
                          aria-label={`Quantity for ${line.name}`}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          aria-label="Increase quantity"
                          disabled={line.trackStock && line.quantity >= line.available}
                          onClick={() => setQuantity(line.productId, line.quantity + 1)}
                        >
                          <Plus aria-hidden="true" className="size-4" />
                        </Button>
                      </div>
                      <span className="text-sm font-medium tabular-nums text-ink">
                        {formatCurrency(roundMoney(line.quantity * line.unitPrice), currency)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="space-y-3 border-t border-border pt-4">
              <FormField label="Member (optional)">
                <Select
                  value={memberId}
                  placeholder="Walk-in customer"
                  options={[{ value: "", label: "Walk-in customer" }, ...memberOptions]}
                  onChange={(event) => setMemberId(event.target.value)}
                />
              </FormField>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Branch" required>
                  <Select
                    value={branchId}
                    placeholder="Select a branch"
                    options={branches.map((branch) => ({
                      value: branch.id,
                      label: `${branch.name} (${branch.code})`,
                    }))}
                    onChange={(event) => setBranchId(event.target.value)}
                  />
                </FormField>
                <FormField label="Payment method" required>
                  <Select
                    value={paymentMethod}
                    options={paymentOptions}
                    onChange={(event) => setPaymentMethod(event.target.value)}
                  />
                </FormField>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <FormField label="Discount" hint="Applied to the total">
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discount}
                    onChange={(event) => setDiscount(event.target.value)}
                  />
                </FormField>
                <FormField label={`Tax mode (${taxMode})`}>
                  <Input readOnly value={taxMode === "inclusive" ? "Prices include tax" : "Tax added on top"} />
                </FormField>
              </div>
              <FormField label="Notes">
                <Textarea
                  rows={2}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Optional note for this sale"
                />
              </FormField>
            </div>

            <div className="space-y-1 border-t border-border pt-4 text-sm">
              <div className="flex justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span>{formatCurrency(totals.subTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Tax</span>
                <span>{formatCurrency(totals.taxTotal, currency)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-neutral-500">Discount</span>
                <span>-{formatCurrency(totals.discount, currency)}</span>
              </div>
              <div className="flex justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(totals.total, currency)}</span>
              </div>
            </div>

            {error && <p className="text-sm text-red-600">{error}</p>}

            <Button type="submit" fullWidth isLoading={submitting} disabled={!canSubmit}>
              <Wallet aria-hidden="true" className="size-4" />
              Complete sale
            </Button>
            {cart.length > 0 && (
              <p className="flex items-center justify-center gap-1.5 text-xs text-neutral-500">
                <CheckCircle2 aria-hidden="true" className="size-3.5" />
                Stock is deducted when the sale completes.
              </p>
            )}
          </CardContent>
        </Card>
      </form>
    </div>
  );
}
