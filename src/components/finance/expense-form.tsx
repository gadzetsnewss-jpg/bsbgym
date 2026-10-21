"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ReceiptText, Save } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { useFinanceSettings } from "@/components/finance/use-finance-settings";
import {
  createExpense,
  fetchExpense,
  fetchFinanceCategories,
  updateExpense,
} from "@/lib/finance/client";
import { todayIso } from "@/lib/finance/utils";
import { categoryOptions, EXPENSE_CATEGORY_SUGGESTIONS } from "@/lib/finance/categories";

interface ExpenseFormProps {
  expenseId?: string;
}

export function ExpenseForm({ expenseId }: ExpenseFormProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;
  const canManage = can("finance.manage");
  const { paymentOptions, defaultMethod } = useFinanceSettings();
  const isEdit = Boolean(expenseId);

  const [branchId, setBranchId] = React.useState(currentBranchId ?? "");
  const [category, setCategory] = React.useState("");
  const [customCategory, setCustomCategory] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [amount, setAmount] = React.useState("");
  const [expenseDate, setExpenseDate] = React.useState(todayIso());
  const [paymentMethod, setPaymentMethod] = React.useState<string>(defaultMethod);
  const [status, setStatus] = React.useState("paid");
  const [reference, setReference] = React.useState("");
  const [categories, setCategories] = React.useState(
    categoryOptions([], EXPENSE_CATEGORY_SUGGESTIONS),
  );
  const [loading, setLoading] = React.useState(isEdit);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!branchId && currentBranchId) setBranchId(currentBranchId);
  }, [branchId, currentBranchId]);

  React.useEffect(() => {
    if (!paymentOptions.some((option) => option.value === paymentMethod) && paymentOptions[0]) {
      setPaymentMethod(paymentOptions[0].value);
    }
  }, [paymentOptions, paymentMethod]);

  React.useEffect(() => {
    if (!orgId) return;
    void fetchFinanceCategories(orgId).then((result) => {
      if (result.data) {
        setCategories(categoryOptions(result.data.expense, EXPENSE_CATEGORY_SUGGESTIONS));
      }
    });
  }, [orgId]);

  React.useEffect(() => {
    if (!orgId || !expenseId) return;
    let active = true;
    setLoading(true);
    void fetchExpense(orgId, expenseId).then((result) => {
      if (!active) return;
      setLoading(false);
      if (result.error) {
        setLoadError(result.error.message);
        return;
      }
      const row = result.data;
      if (!row) return;
      setBranchId(row.branchId);
      setCategories((current) =>
        categoryOptions(
          [...current.map((option) => option.value), row.category],
          EXPENSE_CATEGORY_SUGGESTIONS,
        ),
      );
      setCategory(row.category);
      setDescription(row.description ?? "");
      setAmount(String(row.amount));
      setExpenseDate(row.expenseDate.slice(0, 10));
      setPaymentMethod(row.paymentMethod);
      setStatus(row.status);
      setReference(row.reference ?? "");
    });
    return () => {
      active = false;
    };
  }, [orgId, expenseId]);

  const resolvedCategory = category === "__custom" ? customCategory.trim() : category.trim();

  const validate = () => {
    const next: Record<string, string> = {};
    if (!branchId) next.branchId = "Branch is required";
    if (!resolvedCategory) next.category = "Category is required";
    const parsed = Number(amount);
    if (!amount.trim() || Number.isNaN(parsed) || parsed <= 0) {
      next.amount = "Enter an amount greater than zero";
    }
    if (!expenseDate) next.expenseDate = "Date is required";
    if (!paymentMethod) next.paymentMethod = "Payment method is required";
    if (!status) next.status = "Status is required";
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !canManage || submitting) return;
    if (!validate()) return;
    setSubmitting(true);
    setFormError(null);
    const payload = {
      branchId,
      category: resolvedCategory,
      description: description.trim() || null,
      amount: Number(amount),
      expenseDate,
      paymentMethod,
      status,
      reference: reference.trim() || null,
    };
    const result = isEdit
      ? await updateExpense(expenseId as string, payload)
      : await createExpense(orgId, payload);
    setSubmitting(false);
    if (result.error) {
      setFormError(result.error.message);
      toast({
        title: isEdit ? "Could not save expense" : "Could not record expense",
        description: result.error.message,
        variant: "error",
      });
      return;
    }
    const id = isEdit ? (expenseId as string) : result.data?.id;
    if (!id) return;
    toast({ title: "Expense recorded successfully", variant: "success" });
    router.push(`/finance/expenses/${id}?saved=1`);
  };

  if (!orgId) {
    return (
      <EmptyState
        title="Organization unavailable"
        description="Sign in with an organization to continue."
        action={{ label: "Go to Dashboard", href: "/dashboard" }}
      />
    );
  }

  if (!canManage) {
    return (
      <EmptyState
        title="You cannot record expenses"
        description="Ask an owner, admin or accountant to grant finance.manage."
        action={{ label: "Back to expenses", href: "/finance/expenses" }}
      />
    );
  }

  if (isEdit && loading) return <LoadingState label="Loading expense…" />;
  if (isEdit && loadError) {
    return <ErrorState description={loadError} onRetry={() => router.refresh()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={isEdit ? "Edit expense" : "Add expense"}
        description="Operating costs such as rent, salaries and utilities. Purchases already recorded in Inventory should not be duplicated here."
        icon={ReceiptText}
        actions={
          <ButtonLink href="/finance/expenses" variant="outline">
            Back to expenses
          </ButtonLink>
        }
      />

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Card>
          <CardHeader>
            <CardTitle>Expense details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField label="Branch" required error={errors.branchId}>
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
            <FormField label="Date" required error={errors.expenseDate}>
              <Input type="date" value={expenseDate} onChange={(event) => setExpenseDate(event.target.value)} />
            </FormField>
            <FormField
              label="Category"
              required
              error={errors.category}
              hint="Pick a common category or type your own."
            >
              <Select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
                placeholder="Select a category"
                options={[...categories, { value: "__custom", label: "Other (type below)" }]}
              />
            </FormField>
            {category === "__custom" && (
              <FormField label="Custom category" required>
                <Input
                  value={customCategory}
                  onChange={(event) => setCustomCategory(event.target.value)}
                  placeholder="e.g. Cleaning"
                />
              </FormField>
            )}
            <FormField label="Amount" required error={errors.amount}>
              <Input
                type="number"
                min="0.01"
                step="0.01"
                inputMode="decimal"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </FormField>
            <FormField label="Payment method" required error={errors.paymentMethod}>
              <Select
                value={paymentMethod}
                onChange={(event) => setPaymentMethod(event.target.value)}
                options={paymentOptions}
              />
            </FormField>
            <FormField
              label="Status"
              required
              error={errors.status}
              hint="Pending expenses are commitments, not cash out yet."
            >
              <Select
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                options={[
                  { value: "paid", label: "Paid" },
                  { value: "pending", label: "Pending" },
                ]}
              />
            </FormField>
            <FormField label="Reference">
              <Input
                value={reference}
                onChange={(event) => setReference(event.target.value)}
                placeholder="Bill number or voucher"
              />
            </FormField>
            <FormField label="Description" className="sm:col-span-2">
              <Textarea
                rows={3}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional notes"
              />
            </FormField>
          </CardContent>
        </Card>

        {formError && <p className="text-sm font-medium text-red-600">{formError}</p>}

        <div className="flex flex-wrap gap-2">
          <Button type="submit" isLoading={submitting} disabled={submitting}>
            <Save aria-hidden="true" className="size-4" />
            {isEdit ? "Save changes" : "Record expense"}
          </Button>
          <ButtonLink href="/finance/expenses" variant="outline">
            Cancel
          </ButtonLink>
        </div>
      </form>
    </div>
  );
}
