"use client";

/**
 * Generic create/edit form driven by a `ResourceConfig`.
 *
 * Behaviour is identical for every module: permission gate, zod validation,
 * section layout, RPC submit, success toast and redirect to the detail page.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Save } from "lucide-react";
import type { SelectOption } from "@/components/ui/select";
import { PageHeader } from "@/components/ui/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormSection } from "@/components/ui/form-section";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { FieldControl } from "@/components/crud/field-control";
import { MembershipBillingHandoff } from "@/components/memberships/membership-billing-handoff";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import type {
  FieldValue,
  ResourceConfig,
  ResourceField,
  ResourceValues,
} from "@/lib/crud/types";

function allFields<TRow>(config: ResourceConfig<TRow>): ResourceField[] {
  return config.fields.flatMap((group) => group.fields);
}

function initialValues<TRow>(config: ResourceConfig<TRow>): ResourceValues {
  const values: ResourceValues = {};
  for (const field of allFields(config)) {
    if (field.type === "checkbox") {
      values[field.name] = field.defaultValue ?? false;
    } else {
      values[field.name] = field.defaultValue ?? "";
    }
  }
  return values;
}

export interface ResourceFormProps<TRow> {
  config: ResourceConfig<TRow>;
  mode: "create" | "edit";
  id?: string;
  /** Merged into create-mode defaults (e.g. query-string prefill). */
  defaults?: ResourceValues;
}

export function ResourceForm<TRow>({ config, mode, id, defaults }: ResourceFormProps<TRow>) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;

  const canSubmit =
    mode === "create"
      ? can(config.permissions.create ?? config.permissions.update ?? config.permissions.view)
      : can(config.permissions.update ?? config.permissions.view);

  const [values, setValues] = React.useState<ResourceValues>(() => ({
    ...initialValues(config),
    ...(mode === "create" ? defaults : undefined),
  }));
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [loading, setLoading] = React.useState(mode === "edit");
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [loadedOptions, setLoadedOptions] = React.useState<Record<string, SelectOption[]>>({});

  const branchOptions = React.useMemo<SelectOption[]>(
    () => branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` })),
    [branches],
  );

  const fields = React.useMemo(() => allFields(config), [config]);

  // Load async select options (e.g. trainers) once the organization is known.
  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    const loaders = fields.filter((field) => field.loadOptions);
    if (loaders.length === 0) return;
    void Promise.all(
      loaders.map(async (field) => {
        const options = await field.loadOptions!({ organizationId: orgId });
        return [field.name, options] as const;
      }),
    ).then((entries) => {
      if (cancelled) return;
      setLoadedOptions(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [fields, orgId]);

  // Default branch-scoped selects to the currently selected branch.
  React.useEffect(() => {
    if (mode !== "create" || !currentBranchId) return;
    setValues((prev) => {
      let changed = false;
      const next = { ...prev };
      for (const field of fields) {
        if (field.optionsSource === "branches" && !next[field.name]) {
          next[field.name] = currentBranchId;
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [mode, currentBranchId, fields]);

  // Load the row being edited.
  React.useEffect(() => {
    if (mode !== "edit" || !orgId || !id) return;
    let cancelled = false;
    setLoading(true);
    void config.adapter.get(orgId, id).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (result.error) {
        setLoadError(result.error.message);
        return;
      }
      if (!config.adapter.toFormValues) {
        setLoadError("This resource cannot be edited.");
        return;
      }
      setValues(config.adapter.toFormValues(result.data));
    });
    return () => {
      cancelled = true;
    };
  }, [config, mode, orgId, id]);

  const setField = (name: string, value: FieldValue) => {
    setValues((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => {
      if (!(name in prev)) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  const optionsFor = (field: ResourceField): readonly SelectOption[] => {
    if (field.optionsSource === "branches") return branchOptions;
    return loadedOptions[field.name] ?? field.options ?? [];
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !orgId || !canSubmit) return;

    const validation = config.validate(values);
    if (Object.keys(validation).length > 0) {
      setErrors(validation);
      return;
    }

    setSubmitting(true);
    const result =
      mode === "create"
        ? await config.adapter.create(orgId, values)
        : await config.adapter.update!(id as string, values);
    setSubmitting(false);

    if (result.error) {
      toast({
        title: mode === "create" ? `Could not add ${config.singular}` : `Could not save ${config.singular}`,
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: mode === "create" ? `${config.title.replace(/s$/, "")} added` : "Changes saved",
      variant: "success",
    });
    const targetId = mode === "create" ? (result.data as { id: string }).id : id;
    router.push(`${config.routeBase}/${targetId}`);
    router.refresh();
  };

  if (mode === "edit" && loading) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Edit ${config.singular}`} icon={config.icon} />
        <LoadingState label={`Loading ${config.singular}…`} />
      </div>
    );
  }

  if (mode === "edit" && loadError) {
    return (
      <div className="space-y-6">
        <PageHeader title={`Edit ${config.singular}`} icon={config.icon} />
        <ErrorState description={loadError} onRetry={() => router.refresh()} />
      </div>
    );
  }

  if (!orgId) {
    return (
      <div className="space-y-6">
        <PageHeader title={config.title} icon={config.icon} />
        <EmptyState
          title="Organization unavailable"
          description="Sign in with an organization to continue."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === "create" ? `Add ${config.singular}` : `Edit ${config.singular}`}
        description={config.description}
        icon={config.icon}
        actions={
          <ButtonLink href={config.routeBase} variant="outline">
            Back to {config.title.toLowerCase()}
          </ButtonLink>
        }
      />

      {config.billingHandoff && (
        <MembershipBillingHandoff
          context={config.billingHandoff}
          memberId={typeof values.memberId === "string" ? values.memberId : undefined}
          membershipId={
            typeof values.membershipId === "string"
              ? values.membershipId
              : id
          }
        />
      )}

      {config.formExtras?.({ values, organizationId: orgId })}

      {!canSubmit && (
        <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          You do not have permission to {mode === "create" ? "add" : "edit"} this record.
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        {config.fields.map((group) => (
          <FormSection
            key={group.title}
            title={group.title}
            description={group.description}
            columns={group.columns ?? 2}
          >
            {group.fields
              .filter((field) => !field.hidden)
              .map((field) => (
                <FieldControl
                  key={field.name}
                  field={field}
                  value={values[field.name] ?? (field.type === "checkbox" ? false : "")}
                  error={errors[field.name]}
                  disabled={!canSubmit}
                  options={optionsFor(field)}
                  onChange={setField}
                />
              ))}
          </FormSection>
        ))}

        <div className="flex flex-wrap items-center justify-end gap-3">
          <ButtonLink href={config.routeBase} variant="outline">
            Cancel
          </ButtonLink>
          <Button type="submit" isLoading={submitting} disabled={!canSubmit}>
            {mode === "create" ? (
              <>
                <Plus aria-hidden="true" className="size-4" />
                {config.createLabel ?? `Add ${config.singular}`}
              </>
            ) : (
              <>
                <Save aria-hidden="true" className="size-4" />
                Save changes
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
