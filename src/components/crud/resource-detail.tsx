"use client";

/**
 * Generic record detail page driven by a `ResourceConfig`.
 *
 * Shows the record's fields as a definition list with a status badge and an
 * edit action, plus an optional slot for module-specific panels (tabs, history)
 * added later by each module.
 */

import * as React from "react";
import { Pencil } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import type { SelectOption } from "@/components/ui/select";
import { displayFieldValue } from "@/components/crud/field-control";
import { MembershipBillingHandoff } from "@/components/memberships/membership-billing-handoff";
import { useOrganization } from "@/components/auth/org-provider";
import type { ResourceConfig, ResourceField, ResourceValues } from "@/lib/crud/types";

export interface ResourceDetailProps<TRow> {
  config: ResourceConfig<TRow>;
  id: string;
  /** Extra panels rendered below the detail card. */
  children?: React.ReactNode;
  extras?: (row: TRow) => React.ReactNode;
}

export function ResourceDetail<TRow>({ config, id, children, extras }: ResourceDetailProps<TRow>) {
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;

  const branchOptions = React.useMemo<SelectOption[]>(
    () => branches.map((branch) => ({ value: branch.id, label: `${branch.name} (${branch.code})` })),
    [branches],
  );

  const [loadedOptions, setLoadedOptions] = React.useState<Record<string, SelectOption[]>>({});

  const canEdit = Boolean(
    config.adapter.update &&
      (config.permissions.update ?? config.permissions.create) &&
      can((config.permissions.update ?? config.permissions.create) as string),
  );

  const [row, setRow] = React.useState<TRow | null>(null);
  const [values, setValues] = React.useState<ResourceValues | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setError(null);
    const result = await config.adapter.get(orgId, id);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRow(result.data);
    setValues(
      config.adapter.toFormValues
        ? config.adapter.toFormValues(result.data)
        : Object.fromEntries(
            config.fields
              .flatMap((group) => group.fields)
              .map((field) => [field.name, ""]),
          ),
    );
  }, [config, orgId, id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (!orgId) return;
    const loaders = config.fields.flatMap((group) => group.fields).filter((field) => field.loadOptions);
    if (loaders.length === 0) return;
    let cancelled = false;
    void Promise.all(
      loaders.map(async (field) => {
        const options = await field.loadOptions!({ organizationId: orgId });
        return [field.name, options] as const;
      }),
    ).then((entries) => {
      if (!cancelled) setLoadedOptions(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
  }, [config, orgId]);

  const optionsFor = (field: ResourceField): readonly SelectOption[] | undefined => {
    if (field.optionsSource === "branches") return branchOptions;
    return loadedOptions[field.name] ?? field.options;
  };

  const status = config.status && row ? config.status.fromRow(row) : null;
  const statusLabel =
    status === null
      ? null
      : status
        ? (config.status?.activeLabel ?? "Active")
        : (config.status?.inactiveLabel ?? "Inactive");

  const title = row && config.displayName ? config.displayName(row) : config.title.replace(/s$/, "");

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={config.description}
        icon={config.icon}
        actions={
          <>
            <ButtonLink href={config.routeBase} variant="outline">
              Back to {config.title.toLowerCase()}
            </ButtonLink>
            {canEdit && !config.hideEdit && (
              <ButtonLink href={`${config.routeBase}/${id}/edit`}>
                <Pencil aria-hidden="true" className="size-4" />
                Edit
              </ButtonLink>
            )}
          </>
        }
      />

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : loading || !values ? (
        <LoadingState label={`Loading ${config.singular}…`} />
      ) : (
        <>
          {config.billingHandoff && (
            <MembershipBillingHandoff
              context={config.billingHandoff}
              memberId={typeof values.memberId === "string" ? values.memberId : undefined}
              membershipId={
                typeof values.membershipId === "string" ? values.membershipId : id
              }
            />
          )}

          {statusLabel && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-neutral-500">Status</span>
              <StatusBadge status={statusLabel} />
            </div>
          )}

          {config.fields.map((group) => (
            <Card key={group.title} className="space-y-4">
              <div>
                <h2 className="text-sm font-semibold text-ink">{group.title}</h2>
                {group.description && (
                  <p className="mt-0.5 text-sm text-neutral-500">{group.description}</p>
                )}
              </div>
              <dl className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.name} className="min-w-0">
                    <dt className="text-xs font-medium tracking-wide text-neutral-500 uppercase">
                      {field.label}
                    </dt>
                    <dd className="mt-0.5 text-sm break-words text-ink">
                      {displayFieldValue(field, values[field.name] ?? "", optionsFor(field))}
                    </dd>
                  </div>
                ))}
              </dl>
            </Card>
          ))}

          {row && extras?.(row)}
          {row && config.detailExtras?.(row)}
          {children}
        </>
      )}
    </div>
  );
}
