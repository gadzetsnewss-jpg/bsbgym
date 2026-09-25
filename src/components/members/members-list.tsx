"use client";

/**
 * Gym members list (Phase 3.1).
 *
 * Server-side search, status/branch filters and pagination. All status changes
 * go through the SECURITY DEFINER RPCs; RLS is the final layer.
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, UserMinus, UserRoundCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { ButtonLink } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { RowActions } from "@/components/ui/row-actions";
import { StatusBadge } from "@/components/ui/badge";
import { UserAvatar } from "@/components/ui/user-avatar";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  fetchGymMembers,
  setGymMemberStatus,
  type GymMemberRow,
} from "@/lib/org/gym-members";
import { GYM_MEMBER_STATUS_LABELS } from "@/lib/auth/permissions";
import { displayName, formatDate } from "@/lib/format";
import type { GymMemberStatus } from "@/lib/supabase/types";

const PAGE_SIZE = 20;

const STATUS_FILTERS = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active" },
  { value: "inactive", label: "Inactive" },
  { value: "suspended", label: "Suspended" },
] as const;

type StatusAction = "activate" | "deactivate" | "suspend";

interface PendingAction {
  member: GymMemberRow;
  action: StatusAction;
}

const ACTION_COPY: Record<StatusAction, { title: string; description: string; confirm: string; toast: string }> = {
  activate: {
    title: "Activate member",
    description: "This member will be marked active and counted as a current member.",
    confirm: "Activate",
    toast: "Member activated",
  },
  deactivate: {
    title: "Deactivate member",
    description:
      "This member will be marked inactive. Their record and history are kept — no data is deleted.",
    confirm: "Deactivate",
    toast: "Member deactivated",
  },
  suspend: {
    title: "Suspend member",
    description: "This member will be suspended until they are reactivated.",
    confirm: "Suspend",
    toast: "Member suspended",
  },
};

export interface MembersListProps {
  /** Default status filter (used by the Inactive route). */
  initialStatus?: GymMemberStatus | "all";
  title?: string;
  description?: string;
}

export function MembersList({
  initialStatus = "all",
  title = "Members",
  description = "Every gym member across your branches.",
}: MembersListProps) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, can } = useOrganization();
  const orgId = organization?.id;

  const canCreate = can("members.create");
  const canUpdate = can("members.update");
  const canDeactivate = can("members.delete");

  const [rows, setRows] = React.useState<GymMemberRow[]>([]);
  const [total, setTotal] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [search, setSearch] = React.useState("");
  const [debouncedSearch, setDebouncedSearch] = React.useState("");
  const [status, setStatus] = React.useState<GymMemberStatus | "all">(initialStatus);
  const [branchId, setBranchId] = React.useState<string | "all">("all");
  const [page, setPage] = React.useState(1);

  const [pending, setPending] = React.useState<PendingAction | null>(null);
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
    const result = await fetchGymMembers({
      organizationId: orgId,
      search: debouncedSearch,
      status,
      branchId,
      page,
      pageSize: PAGE_SIZE,
    });
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data.rows);
    setTotal(result.data.total);
  }, [orgId, debouncedSearch, status, branchId, page]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const activeFilterCount =
    (status !== "all" ? 1 : 0) + (branchId !== "all" ? 1 : 0) + (debouncedSearch ? 1 : 0);

  const clearFilters = () => {
    setStatus("all");
    setBranchId("all");
    setSearch("");
    setPage(1);
  };

  const confirmStatus = async () => {
    if (!pending) return;
    const next: GymMemberStatus =
      pending.action === "activate" ? "active" : pending.action === "suspend" ? "suspended" : "inactive";
    setSaving(true);
    const result = await setGymMemberStatus(pending.member.id, next);
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not update member", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: ACTION_COPY[pending.action].toast, variant: "success" });
    setPending(null);
    void load();
  };

  const columns: Column<GymMemberRow>[] = [
    {
      id: "member",
      header: "Member",
      cell: (row) => (
        <div className="flex items-center gap-3">
          <UserAvatar name={displayName(row)} src={row.photoUrl ?? undefined} />
          <div className="min-w-0">
            <p className="truncate font-medium text-ink">{displayName(row)}</p>
            <p className="truncate text-xs text-neutral-400">{row.code}</p>
          </div>
        </div>
      ),
    },
    {
      id: "phone",
      header: "Phone",
      cell: (row) => <span className="text-sm text-neutral-600">{row.phone}</span>,
    },
    {
      id: "email",
      header: "Email",
      cell: (row) => <span className="text-sm text-neutral-600">{row.email ?? "—"}</span>,
    },
    {
      id: "branch",
      header: "Branch",
      cell: (row) => <span className="text-sm text-neutral-600">{row.branchName}</span>,
    },
    {
      id: "joined",
      header: "Joined",
      cell: (row) => <span className="text-sm text-neutral-600">{formatDate(row.joinedAt)}</span>,
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => (
        <StatusBadge status={GYM_MEMBER_STATUS_LABELS[row.status] ?? row.status} />
      ),
    },
    {
      id: "actions",
      header: "",
      align: "right",
      cell: (row) => {
        const items = [];
        items.push({ label: "View details", href: `/members/${row.id}` });
        if (canUpdate) {
          items.push({ label: "Edit", href: `/members/${row.id}/edit`, separator: true });
        }
        if (canUpdate && row.status === "active") {
          items.push({
            label: "Suspend",
            icon: UserMinus,
            variant: "danger" as const,
            onClick: () => setPending({ member: row, action: "suspend" }),
            separator: true,
          });
        }
        if (canDeactivate && row.status !== "inactive") {
          items.push({
            label: "Deactivate",
            icon: UserMinus,
            variant: "danger" as const,
            onClick: () => setPending({ member: row, action: "deactivate" }),
            separator: row.status !== "active" || !canUpdate,
          });
        }
        if ((canUpdate || canDeactivate) && row.status !== "active") {
          items.push({
            label: "Activate",
            icon: UserRoundCheck,
            onClick: () => setPending({ member: row, action: "activate" }),
            separator: true,
          });
        }
        if (items.length === 0) return null;
        return <RowActions label={`Actions for ${displayName(row)}`} items={items} />;
      },
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={title}
        description={description}
        icon={Users}
        actions={
          canCreate ? (
            <ButtonLink href="/members/add">
              <Plus aria-hidden="true" className="size-4" />
              Add member
            </ButtonLink>
          ) : undefined
        }
      />

      <div className="flex flex-wrap items-center gap-3">
        <SearchBar
          value={search}
          onValueChange={setSearch}
          placeholder="Search name, code, phone…"
          aria-label="Search members"
        />
        <FilterBar
          className="flex-1"
          activeCount={activeFilterCount}
          onClear={clearFilters}
        >
          <Select
            aria-label="Filter by status"
            className="w-full sm:w-40"
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as GymMemberStatus | "all");
              setPage(1);
            }}
            options={[...STATUS_FILTERS]}
          />
          <Select
            aria-label="Filter by branch"
            className="w-full sm:w-48"
            value={branchId}
            onChange={(event) => {
              setBranchId(event.target.value);
              setPage(1);
            }}
            options={[
              { value: "all", label: "All branches" },
              ...branches.map((branch) => ({ value: branch.id, label: branch.name })),
            ]}
          />
        </FilterBar>
      </div>

      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : (
        <DataTable
          columns={columns}
          data={rows}
          rowKey={(row) => row.id}
          loading={loading}
          onRowClick={(row) => router.push(`/members/${row.id}`)}
          emptyTitle={activeFilterCount > 0 ? "No members match your filters" : "No members yet"}
          emptyDescription={
            activeFilterCount > 0
              ? "Try adjusting your search or clearing the filters."
              : "Add your first gym member to get started."
          }
          emptyAction={
            canCreate ? (
              <ButtonLink href="/members/add" variant="outline" size="sm">
                <Plus aria-hidden="true" className="size-4" />
                Add member
              </ButtonLink>
            ) : undefined
          }
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
        />
      )}

      <ConfirmDialog
        open={pending !== null}
        onClose={() => setPending(null)}
        onConfirm={() => void confirmStatus()}
        title={pending ? ACTION_COPY[pending.action].title : ""}
        description={
          pending
            ? `${ACTION_COPY[pending.action].description} ${displayName(pending.member)} (${pending.member.code}).`
            : ""
        }
        confirmLabel={pending ? ACTION_COPY[pending.action].confirm : "Confirm"}
        tone={pending?.action === "activate" ? "primary" : "danger"}
        isLoading={saving}
      />
    </div>
  );
}
