"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Plus, Save, ShoppingBasket, Trash2 } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { createPurchase, loadPosProducts, loadSupplierOptions } from "@/lib/inventory/client";
import type { ProductRow } from "@/lib/catalog/adapters";
import type { SelectOption } from "@/components/ui/select";
import { formatCurrency } from "@/lib/format";

interface DraftLine {
  key: string;
  productId: string;
  quantity: string;
  unitCost: string;
}

function newLine(): DraftLine {
  return { key: Math.random().toString(36).slice(2), productId: "", quantity: "1", unitCost: "0" };
}

export function PurchaseForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, branches, currentBranchId } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const presetSupplier = searchParams.get("supplier") ?? "";
  const presetProduct = searchParams.get("product") ?? "";

  const [products, setProducts] = React.useState<ProductRow[]>([]);
  const [supplierOptions, setSupplierOptions] = React.useState<SelectOption[]>([]);
  const [supplierId, setSupplierId] = React.useState(presetSupplier);
  const [branchId, setBranchId] = React.useState(currentBranchId ?? "");
  const [orderDate, setOrderDate] = React.useState(new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = React.useState("");
  const [lines, setLines] = React.useState<DraftLine[]>(() =>
    presetProduct ? [{ ...newLine(), productId: presetProduct }] : [newLine()],
  );
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!orgId) return;
    void loadPosProducts(orgId).then((loaded) => {
      setProducts(loaded);
      if (presetProduct) {
        const product = loaded.find((item) => item.id === presetProduct);
        if (product) {
          setLines((current) =>
            current.map((line) =>
              line.productId === presetProduct
                ? { ...line, unitCost: String(product.costPrice) }
                : line,
            ),
          );
        }
      }
    });
    void loadSupplierOptions(orgId).then(setSupplierOptions);
  }, [orgId, presetProduct]);

  React.useEffect(() => {
    if (!branchId && currentBranchId) setBranchId(currentBranchId);
  }, [branchId, currentBranchId]);

  const productById = React.useMemo(() => {
    const map = new Map<string, ProductRow>();
    products.forEach((product) => map.set(product.id, product));
    return map;
  }, [products]);

  const productOptions = React.useMemo(
    () =>
      products.map((product) => ({
        value: product.id,
        label: product.sku ? `${product.name} (${product.sku})` : product.name,
      })),
    [products],
  );

  const updateLine = (key: string, patch: Partial<DraftLine>) => {
    setLines((current) => current.map((line) => (line.key === key ? { ...line, ...patch } : line)));
  };

  const onPickProduct = (key: string, productId: string) => {
    const product = productById.get(productId);
    updateLine(key, {
      productId,
      unitCost: product ? String(product.costPrice) : "0",
    });
  };

  const totals = React.useMemo(() => {
    let subTotal = 0;
    let taxTotal = 0;
    lines.forEach((line) => {
      const product = productById.get(line.productId);
      const qty = Number(line.quantity) || 0;
      const cost = Number(line.unitCost) || 0;
      const lineTotal = qty * cost;
      subTotal += lineTotal;
      taxTotal += lineTotal * ((product?.taxRate ?? 0) / 100);
    });
    return { subTotal, taxTotal, total: subTotal + taxTotal };
  }, [lines, productById]);

  const canSubmit =
    Boolean(supplierId) &&
    Boolean(branchId) &&
    lines.some((line) => line.productId && Number(line.quantity) > 0) &&
    !submitting;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !canSubmit) return;
    setSubmitting(true);
    setError(null);

    const items = lines
      .filter((line) => line.productId && Number(line.quantity) > 0)
      .map((line) => ({
        productId: line.productId,
        quantity: Number(line.quantity),
        unitCost: Number(line.unitCost) || 0,
      }));

    const result = await createPurchase({
      organizationId: orgId,
      branchId,
      supplierId,
      orderDate,
      notes: notes || null,
      items,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    toast({ title: "Purchase created", description: "Receive it to add stock.", variant: "success" });
    router.push(`/inventory/purchases/${result.data.id}`);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="New purchase"
        description="Order stock from a supplier. Receive it later to update inventory."
        icon={ShoppingBasket}
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Purchase details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Supplier" required>
              <Select
                value={supplierId}
                onChange={(event) => setSupplierId(event.target.value)}
                placeholder="Select a supplier"
                options={supplierOptions}
              />
            </FormField>
            <FormField label="Branch" required>
              <Select
                value={branchId}
                onChange={(event) => setBranchId(event.target.value)}
                placeholder="Select a branch"
                options={branches.map((branch) => ({
                  value: branch.id,
                  label: `${branch.name} (${branch.code})`,
                }))}
              />
            </FormField>
            <FormField label="Order date" required>
              <Input type="date" value={orderDate} onChange={(event) => setOrderDate(event.target.value)} />
            </FormField>
            <FormField label="Notes" className="sm:col-span-2">
              <Textarea
                rows={2}
                value={notes}
                placeholder="Optional reference or delivery instructions"
                onChange={(event) => setNotes(event.target.value)}
              />
            </FormField>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>Items</CardTitle>
            <Button type="button" variant="outline" size="sm" onClick={() => setLines((l) => [...l, newLine()])}>
              <Plus aria-hidden="true" className="size-4" />
              Add item
            </Button>
          </CardHeader>
          <CardContent className="space-y-3">
            {products.length === 0 ? (
              <EmptyState
                title="No products yet"
                description="Add products before creating a purchase."
                action={{ label: "Add product", href: "/inventory/products/add", variant: "outline" }}
              />
            ) : (
              lines.map((line) => {
                const product = productById.get(line.productId);
                const lineTotal = (Number(line.quantity) || 0) * (Number(line.unitCost) || 0);
                return (
                  <div key={line.key} className="grid items-end gap-3 rounded-lg border border-border p-3 sm:grid-cols-12">
                    <div className="sm:col-span-5">
                      <FormField label="Product">
                        <Select
                          value={line.productId}
                          placeholder="Select product"
                          options={productOptions}
                          onChange={(event) => onPickProduct(line.key, event.target.value)}
                        />
                      </FormField>
                    </div>
                    <div className="sm:col-span-2">
                      <FormField label="Quantity">
                        <Input
                          type="number"
                          min="0"
                          step="0.001"
                          value={line.quantity}
                          onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                        />
                      </FormField>
                    </div>
                    <div className="sm:col-span-2">
                      <FormField label="Unit cost">
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={line.unitCost}
                          onChange={(event) => updateLine(line.key, { unitCost: event.target.value })}
                        />
                      </FormField>
                    </div>
                    <div className="sm:col-span-2">
                      <FormField label="Line total">
                        <Input readOnly value={formatCurrency(lineTotal, currency)} />
                      </FormField>
                    </div>
                    <div className="sm:col-span-1 flex justify-end">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        aria-label="Remove item"
                        disabled={lines.length === 1}
                        onClick={() => setLines((current) => current.filter((item) => item.key !== line.key))}
                      >
                        <Trash2 aria-hidden="true" className="size-4" />
                      </Button>
                    </div>
                    {product && (
                      <p className="text-xs text-neutral-500 sm:col-span-12">
                        Tax {product.taxRate}% · on hand {product.stockQuantity} {product.unit}
                      </p>
                    )}
                  </div>
                );
              })
            )}

            <div className="flex flex-col items-end gap-1 border-t border-border pt-3 text-sm">
              <div className="flex w-full max-w-xs justify-between">
                <span className="text-neutral-500">Subtotal</span>
                <span>{formatCurrency(totals.subTotal, currency)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between">
                <span className="text-neutral-500">Tax</span>
                <span>{formatCurrency(totals.taxTotal, currency)}</span>
              </div>
              <div className="flex w-full max-w-xs justify-between text-base font-semibold">
                <span>Total</span>
                <span>{formatCurrency(totals.total, currency)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <ButtonLink href="/inventory/purchases" variant="outline">
            Cancel
          </ButtonLink>
          <Button type="submit" isLoading={submitting} disabled={!canSubmit}>
            <Save aria-hidden="true" className="size-4" />
            Create purchase
          </Button>
        </div>
      </form>
    </div>
  );
}
