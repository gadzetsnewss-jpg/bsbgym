"use client";

/**
 * Generic resource list driven by a `ResourceConfig`.
 *
 * Provides the shared SaaS list experience: server-side search, filters and
 * pagination, a consistent table, status badge, row actions and an
 * activate/deactivate confirmation. All writes go through the adapter (RPCs).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Power, PowerOff } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RowActions } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/badge";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type { ResourceColumn, ResourceConfig } from "@/lib/crud/types";

const DEFAULT_PAGE_SIZE = 20;

export interface ResourceListProps<TRow> {
  config: ResourceConfig<TRow>;
}

export function ResourceList<TRow>({ config }: ResourceListProps<TRow>) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";

  const pageSize = config.pageSize ?? DEFAULT_PAGE_SIZE;
  const canCreate = Boolean(config.permissions.create && can(config.permissions.create));
  const canUpdate = Boolean(
    (config.permissions.update ?? config.permissions.create) &&
      can((config.permissions.update ?? config.permissions.create) as string),
  );

  const [rows, setRows] = React.useState<TRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [page, setPage] = React.useState(1);
  const [filters, setFilters] = React.useState<Record<string, string>>(() =>
    Object.fromEntries(
      (config.filters ?? []).map((filter) => [
        filter.name,
        config.defaultFilters?.[filter.name] ?? "all",
      ]),
    ),
  );

  const [pendingToggle, setPendingToggle] = React.useState<TRow | null>(null);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    const timeout = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(timeout);
  }, [search]);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await config.adapter.list({
      organizationId: orgId,
      search: debouncedSearch,
      page,
      pageSize,
      filters,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
    setTotal(result.data.total);
  }, [config, orgId, debouncedSearch, page, pageSize, filters]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const activeFilterCount =
    Object.values(filters).filter((value) => value !== "all").length +
    (debouncedSearch ? 1 : 0);

  const clearFilters = () => {
    setFilters(
      Object.fromEntries(
        (config.filters ?? []).map((filter) => [
          filter.name,
          config.defaultFilters?.[filter.name] ?? "all",
        ]),
      ),
    );
    setSearch("");
    setPage(1);
  };

  const statusOf = (row: TRow) => {
    if (!config.status) return null;
    const active = config.status.fromRow(row);
    const label = active
      ? (config.status.activeLabel ?? "Active")
      : (config.status.inactiveLabel ?? "Inactive");
    return { active, label };
  };

  const confirmToggle = async () => {
    if (!pendingToggle || !config.adapter.setActive) return;
    const current = statusOf(pendingToggle);
    if (!current) return;
    setSaving(true);
    const result = await config.adapter.setActive(
      (pendingToggle as unknown as { id: string }).id,
      !current.active,
    );
    setSaving(false);
    if (result.error) {
      toast({ title: `Could not update ${config.singular}`, description: result.error.message, variant: "error" });
      return;
    }
    toast({
      title: current.active
        ? `${config.title.replace(/s$/, "")} deactivated`
        : `${config.title.replace(/s$/, "")} activated`,
      variant: "success",
    });
    setPendingToggle(null);
    void load();
  };

  const renderCell = React.useCallback(
    (column: ResourceColumn<TRow>, row: TRow): React.ReactNode => {
      if (column.cell) return column.cell(row);
      const value = column.accessor ? column.accessor(row) : undefined;
      const format = column.format ?? "text";

      if (value === null || value === undefined || value === "") {
        return <span className="text-sm text-neutral-400">—</span>;
      }

      switch (format) {
        case "muted":
          return <span className="text-sm text-neutral-600">{String(value)}</span>;
        case "code":
          return <span className="font-mono text-xs text-neutral-500">{String(value)}</span>;
        case "date":
          return <span className="text-sm text-neutral-600">{formatDate(String(value))}</span>;
        case "datetime":
          return <span className="text-sm text-neutral-600">{formatDateTime(String(value))}</span>;
        case "currency":
          return (
            <span className="text-sm font-medium tabular-nums text-ink">
              {formatCurrency(Number(value), currency)}
            </span>
          );
        case "number":
          return <span className="text-sm tabular-nums text-neutral-600">{String(value)}</span>;
        case "boolean":
          return <StatusBadge status={value ? "Active" : "Inactive"} />;
        default:
          return <span className="text-sm text-ink">{String(value)}</span>;
      }
    },
    [currency],
  );

  const columns = React.useMemo<Column<TRow>[]>(() => {
    const cols: Column<TRow>[] = config.columns.map((column) => ({
      id: column.id,
      header: column.header,
      align: column.align,
      cell: (row) => renderCell(column, row),
    }));

    if (config.status) {
      cols.push({
        id: "__status",
        header: "Status",
        cell: (row) => {
          const status = statusOf(row);
          return status ? <StatusBadge status={status.label} /> : null;
        },
      });
    }

    cols.push({
      id: "__actions",
      header: "",
      align: "right",
      cell: (row) => {
        const items = [];
        if (!config.hideEdit) {
          items.push({ label: "View details", href: `${config.routeBase}/${(row as { id: string }).id}` });
        }
        if (canUpdate && !config.hideEdit && config.adapter.update) {
          items.push({
            label: "Edit",
            href: `${config.routeBase}/${(row as { id: string }).id}/edit`,
            separator: true,
          });
        }
        const extras = config.extraRowActions ? config.extraRowActions(row) : [];
        if (extras.length > 0) {
          items.push(
            ...extras.map((item, index) => ({
              ...item,
              separator: item.separator ?? (index === 0 && items.length > 0),
            })),
          );
        }
        const status = statusOf(row);
        if (config.status && config.adapter.setActive && canUpdate && status) {
          items.push({
            label: status.active ? "Deactivate" : "Activate",
            icon: status.active ? PowerOff : Power,
            variant: status.active ? ("danger" as const) : undefined,
            separator: true,
            onClick: () => setPendingToggle(row),
          });
        }
        if (items.length === 0) return null;
        return <RowActions label={`Actions for this ${config.singular}`} items={items} />;
      },
    });

    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, canUpdate, renderCell]);

  return (
    <div className="space-y-6">
      <PageHeader
        title={config.title}
        description={config.description}
        icon={config.icon}
        actions={
          canCreate && !config.hideCreate ? (
            <ButtonLink href={`${config.routeBase}/add`}>
              <Plus aria-hidden="true" className="size-4" />
              {config.createLabel ?? `Add ${config.singular}`}
            </ButtonLink>
          ) : undefined
        }
      />

      {(config.filters?.length ?? 0) > 0 || config.searchPlaceholder ? (
        <div className="flex flex-wrap items-center gap-3">
          {config.searchPlaceholder && (
            <SearchBar
              value={search}
              onValueChange={setSearch}
              placeholder={config.searchPlaceholder}
              aria-label={`Search ${config.title.toLowerCase()}`}
            />
          )}
          <FilterBar className="flex-1" activeCount={activeFilterCount} onClear={clearFilters}>
            {(config.filters ?? []).map((filter) => {
              const branchOptions = branches.map((branch) => ({
                value: branch.id,
                label: `${branch.name} (${branch.code})`,
              }));
              const options =
                filter.optionsSource === "branches" ? branchOptions : (filter.options ?? []);
              return (
                <Select
                  key={filter.name}
                  aria-label={filter.label}
                  className="w-full sm:w-48"
                  value={filters[filter.name] ?? "all"}
                  onChange={(event) => {
                    setFilters((prev) => ({ ...prev, [filter.name]: event.target.value }));
                    setPage(1);
                  }}
                  options={[{ value: "all", label: filter.allLabel }, ...options]}
                />
              );
            })}
          </FilterBar>
        </div>
      ) : null}

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => (row as { id: string }).id}
          loading={loading}
          onRowClick={(row) => router.push(`${config.routeBase}/${(row as { id: string }).id}`)}
          emptyTitle={
            activeFilterCount > 0
              ? `No ${config.title.toLowerCase()} match your filters`
              : `No ${config.title.toLowerCase()} yet`
          }
          emptyDescription={
            activeFilterCount > 0
              ? "Try adjusting your search or clearing the filters."
              : config.emptyDescription
          }
          emptyAction={
            canCreate && !config.hideCreate ? (
              <ButtonLink href={`${config.routeBase}/add`} variant="outline" size="sm">
                <Plus aria-hidden="true" className="size-4" />
                {config.createLabel ?? `Add ${config.singular}`}
              </ButtonLink>
            ) : undefined
          }
          page={page}
          pageSize={pageSize}
          total={total}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={pendingToggle !== null}
        onClose={() => setPendingToggle(null)}
        onConfirm={() => void confirmToggle()}
        title={
          pendingToggle && statusOf(pendingToggle)?.active
            ? `Deactivate ${config.singular}`
            : `Activate ${config.singular}`
        }
        description={
          pendingToggle && statusOf(pendingToggle)?.active
            ? `This ${config.singular} will be marked inactive and hidden from new selections. Existing records are kept.`
            : `This ${config.singular} will be marked active again.`
        }
        confirmLabel={
          pendingToggle && statusOf(pendingToggle)?.active ? "Deactivate" : "Activate"
        }
        tone={pendingToggle && statusOf(pendingToggle)?.active ? "danger" : "primary"}
        isLoading={saving}
      />
    </div>
  );
}
