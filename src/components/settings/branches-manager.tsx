"use client";

import * as React from "react";
import { Pencil, Plus, Power, RotateCcw, Store } from "lucide-react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RowActions } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/badge";
import { Modal } from "@/components/ui/modal";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { AddressFields, ContactFields, TimezoneField } from "@/components/onboarding/fields";
import {
  createBranch,
  fetchOrgBranchRows,
  setBranchStatus,
  updateBranch,
  type OrgBranchRow,
} from "@/lib/org/settings";
import { branchFormSchema } from "@/lib/validation/auth-schemas";
import { BRANCH_STATUS_LABELS } from "@/lib/auth/permissions";
import type { BranchStatus } from "@/lib/supabase/types";

type BranchFormValues = z.infer<typeof branchFormSchema>;

const EMPTY_FORM: BranchFormValues = {
  name: "",
  code: "",
  phone: "",
  email: "",
  gstin: "",
  timezone: "Asia/Kolkata",
  addressLine1: "",
  addressLine2: "",
  city: "",
  state: "",
  postalCode: "",
  country: "",
};

function formFromBranch(branch: OrgBranchRow): BranchFormValues {
  return {
    name: branch.name,
    code: branch.code,
    phone: branch.phone ?? "",
    email: branch.email ?? "",
    gstin: branch.gstin ?? "",
    timezone: branch.timezone,
    addressLine1: branch.addressLine1 ?? "",
    addressLine2: branch.addressLine2 ?? "",
    city: branch.city ?? "",
    state: branch.state ?? "",
    postalCode: branch.postalCode ?? "",
    country: branch.country ?? "",
  };
}

export function BranchesManager() {
  const { organization, can, updateBranchesLocal } = useOrganization();
  const { toast } = useToast();
  const orgId = organization?.id;
  const canManage = can("branches.manage");

  const [branches, setBranches] = React.useState<OrgBranchRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<OrgBranchRow | null>(null);
  const [form, setForm] = React.useState<BranchFormValues>(EMPTY_FORM);
  const [formErrors, setFormErrors] = React.useState<Partial<Record<keyof BranchFormValues, string>>>({});
  const [saving, setSaving] = React.useState(false);

  const [statusBranch, setStatusBranch] = React.useState<OrgBranchRow | null>(null);
  const [statusNext, setStatusNext] = React.useState<BranchStatus>("inactive");
  const [savingStatus, setSavingStatus] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchOrgBranchRows(orgId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setBranches(result.data);
    updateBranchesLocal(
      result.data
        .filter((branch) => branch.status === "active")
        .map((branch) => ({
          id: branch.id,
          name: branch.name,
          code: branch.code,
          gstin: branch.gstin,
          phone: branch.phone,
          email: branch.email,
          addressLine1: branch.addressLine1,
          addressLine2: branch.addressLine2,
          city: branch.city,
          state: branch.state,
          postalCode: branch.postalCode,
          country: branch.country,
          timezone: branch.timezone,
          status: branch.status,
        })),
    );
  }, [orgId, updateBranchesLocal]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const openCreate = () => {
    setEditing(null);
    setForm({
      ...EMPTY_FORM,
      timezone: organization?.timezone ?? "Asia/Kolkata",
      country: organization?.country ?? "",
    });
    setFormErrors({});
    setEditorOpen(true);
  };

  const openEdit = (branch: OrgBranchRow) => {
    setEditing(branch);
    setForm(formFromBranch(branch));
    setFormErrors({});
    setEditorOpen(true);
  };

  const setField = (field: string, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
    setFormErrors((prev) =>
      field in prev ? { ...prev, [field]: undefined } : prev,
    );
  };

  const handleSave = async () => {
    if (!orgId || saving) return;
    const parsed = branchFormSchema.safeParse(form);
    if (!parsed.success) {
      const next: Partial<Record<keyof BranchFormValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof BranchFormValues | undefined;
        if (key && !next[key]) next[key] = issue.message;
      }
      setFormErrors(next);
      return;
    }

    setSaving(true);
    const payload = parsed.data;
    const result = editing
      ? await updateBranch({
          branchId: editing.id,
          name: payload.name,
          phone: payload.phone,
          email: payload.email,
          gstin: payload.gstin,
          addressLine1: payload.addressLine1,
          addressLine2: payload.addressLine2,
          city: payload.city,
          state: payload.state,
          postalCode: payload.postalCode,
          country: payload.country,
          timezone: payload.timezone,
        })
      : await createBranch({
          organizationId: orgId,
          name: payload.name,
          code: payload.code,
          phone: payload.phone,
          email: payload.email,
          gstin: payload.gstin,
          addressLine1: payload.addressLine1,
          addressLine2: payload.addressLine2,
          city: payload.city,
          state: payload.state,
          postalCode: payload.postalCode,
          country: payload.country,
          timezone: payload.timezone,
        });
    setSaving(false);

    if (result.error) {
      toast({
        title: editing ? "Could not update branch" : "Could not create branch",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: editing ? "Branch updated" : "Branch created",
      variant: "success",
    });
    setEditorOpen(false);
    void load();
  };

  const confirmStatus = async () => {
    if (!statusBranch) return;
    setSavingStatus(true);
    const result = await setBranchStatus(statusBranch.id, statusNext);
    setSavingStatus(false);
    if (result.error) {
      toast({ title: "Could not update status", description: result.error.message, variant: "error" });
      return;
    }
    toast({
      title: statusNext === "active" ? "Branch reactivated" : "Branch deactivated",
      variant: "success",
    });
    setStatusBranch(null);
    void load();
  };

  const activeCount = branches.filter((branch) => branch.status === "active").length;

  const columns: Column<OrgBranchRow>[] = [
    {
      id: "name",
      header: "Branch",
      cell: (row) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-ink">{row.name}</p>
          <p className="text-xs text-neutral-500">{row.code}</p>
        </div>
      ),
      sortValue: (row) => row.name.toLowerCase(),
    },
    {
      id: "city",
      header: "Location",
      cell: (row) => (
        <span className="text-sm text-neutral-600">
          {[row.city, row.state].filter(Boolean).join(", ") || "—"}
        </span>
      ),
      sortValue: (row) => (row.city ?? "").toLowerCase(),
    },
    {
      id: "gstin",
      header: "GSTIN",
      cell: (row) => <span className="text-sm text-neutral-600">{row.gstin || "—"}</span>,
      sortValue: (row) => row.gstin ?? "",
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={BRANCH_STATUS_LABELS[row.status] ?? row.status} />,
      sortValue: (row) => row.status,
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        if (!canManage) return null;
        const isLastActive = row.status === "active" && activeCount <= 1;
        return (
          <RowActions
            label={`Actions for ${row.name}`}
            items={[
              {
                label: "Edit",
                icon: Pencil,
                onClick: () => openEdit(row),
              },
              row.status === "active"
                ? {
                    label: "Deactivate",
                    icon: Power,
                    variant: "danger" as const,
                    disabled: isLastActive,
                    onClick: () => {
                      setStatusBranch(row);
                      setStatusNext("inactive");
                    },
                  }
                : {
                    label: "Reactivate",
                    icon: RotateCcw,
                    onClick: () => {
                      setStatusBranch(row);
                      setStatusNext("active");
                    },
                  },
            ]}
          />
        );
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Branches"
        description="Locations this organization operates from."
        actions={
          canManage ? (
            <Button onClick={openCreate}>
              <Plus aria-hidden="true" className="size-4" />
              Add branch
            </Button>
          ) : undefined
        }
      />

      {loading ? (
        <LoadingState label="Loading branches…" />
      ) : error ? (
        <ErrorState title="Could not load branches" description={error} onRetry={() => void load()} />
      ) : branches.length === 0 ? (
        <EmptyState
          title="No branches yet"
          description="Create the first location for this organization."
          icon={Store}
          action={
            canManage
              ? { label: "Add branch", onClick: openCreate, icon: Plus }
              : undefined
          }
        />
      ) : (
        <DataTable
          columns={columns}
          data={branches}
          rowKey={(row) => row.id}
          emptyTitle="No branches"
        />
      )}

      <Modal
        open={editorOpen}
        onClose={() => setEditorOpen(false)}
        title={editing ? "Edit branch" : "Add branch"}
        description={
          editing
            ? "Update contact, GSTIN and address details. The branch code cannot be changed."
            : "Create a new location. The code is unique per organization."
        }
        size="lg"
        footer={
          <>
            <Button variant="outline" onClick={() => setEditorOpen(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void handleSave()} isLoading={saving}>
              {editing ? "Save changes" : "Create branch"}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Branch name" required error={formErrors.name}>
              <Input
                value={form.name}
                invalid={Boolean(formErrors.name)}
                onChange={(event) => setField("name", event.target.value)}
              />
            </FormField>
            <FormField
              label="Code"
              required
              error={formErrors.code}
              hint={editing ? "Codes are immutable after creation." : "Letters, numbers, dashes or underscores."}
            >
              <Input
                value={form.code}
                invalid={Boolean(formErrors.code)}
                onChange={(event) => setField("code", event.target.value.toUpperCase())}
                disabled={Boolean(editing)}
              />
            </FormField>
            <FormField label="GSTIN" error={formErrors.gstin}>
              <Input
                value={form.gstin ?? ""}
                invalid={Boolean(formErrors.gstin)}
                onChange={(event) => setField("gstin", event.target.value.toUpperCase())}
              />
            </FormField>
            <TimezoneField
              values={form as Record<string, string>}
              errors={formErrors as Record<string, string | undefined>}
              onChange={setField}
            />
          </div>
          <ContactFields
            values={form as Record<string, string>}
            errors={formErrors as Record<string, string | undefined>}
            onChange={setField}
          />
          <AddressFields
            values={form as Record<string, string>}
            errors={formErrors as Record<string, string | undefined>}
            onChange={setField}
          />
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(statusBranch)}
        onClose={() => setStatusBranch(null)}
        onConfirm={() => void confirmStatus()}
        title={statusNext === "active" ? "Reactivate branch?" : "Deactivate branch?"}
        description={
          statusNext === "active"
            ? `${statusBranch?.name ?? "This branch"} will become available for members and operations again.`
            : `${statusBranch?.name ?? "This branch"} will be hidden from day-to-day operations. The last active branch cannot be deactivated.`
        }
        confirmLabel={statusNext === "active" ? "Reactivate" : "Deactivate"}
        tone={statusNext === "active" ? "primary" : "danger"}
        isLoading={savingStatus}
      />
    </div>
  );
}
