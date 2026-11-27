"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Salad,
  Plus,
  Search,
  Filter,
  CheckCircle,
  FileText,
  Clock,
  Send,
  Eye,
  Check,
  Calendar,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { SearchBar } from "@/components/ui/search-bar";
import { FilterBar } from "@/components/ui/filter-bar";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { RowActions } from "@/components/ui/row-actions";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { fetchLinkedTrainerId } from "@/lib/org/gym-members";
import {
  fetchDietPlansList,
  publishDietPlan,
  completeDietPlan,
  cloneDietPlanToDraft,
  DIET_PLAN_GOALS,
  type DietPlanRecord,
  type DietPlanStatus,
} from "@/lib/fitness/diet-plans";

export function DietPlansList() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, profile, hasRole, can } = useOrganization();
  const orgId = organization?.id;
  const isTrainer = hasRole(["trainer"]);

  const [rows, setRows] = React.useState<DietPlanRecord[]>([]);
  const [summary, setSummary] = React.useState({
    total: 0,
    active: 0,
    draft: 0,
    completed: 0,
  });
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  // Filters
  const [status, setStatus] = React.useState<string>("all");
  const [goal, setGoal] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  // Action states
  const [publishRow, setPublishRow] = React.useState<DietPlanRecord | null>(null);
  const [publishSaving, setPublishSaving] = React.useState(false);
  const [completeRow, setCompleteRow] = React.useState<DietPlanRecord | null>(null);
  const [completeSaving, setCompleteSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    let trainerId: string | undefined = undefined;
    if (isTrainer && profile?.id) {
      const tRes = await fetchLinkedTrainerId(orgId, profile.id);
      if (tRes.data) {
        trainerId = tRes.data;
      }
    }

    const result = await fetchDietPlansList(orgId, {
      status,
      goal,
      search,
      trainerId,
    });

    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }

    setRows(result.data.rows);
    setSummary(result.data.summary);
  }, [orgId, isTrainer, profile?.id, status, goal, search]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handlePublish = async () => {
    if (!publishRow) return;
    setPublishSaving(true);
    const result = await publishDietPlan(publishRow.id);
    setPublishSaving(false);

    if (result.error) {
      toast({
        title: "Could not publish diet plan",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Diet plan published",
      description: `Plan is now visible to ${publishRow.memberName}.`,
      variant: "success",
    });
    setPublishRow(null);
    void load();
  };

  const handleComplete = async () => {
    if (!completeRow) return;
    setCompleteSaving(true);
    const result = await completeDietPlan(completeRow.id);
    setCompleteSaving(false);

    if (result.error) {
      toast({
        title: "Could not complete diet plan",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Diet plan marked as completed",
      variant: "success",
    });
    setCompleteRow(null);
    void load();
  };

  const handleClone = async (row: DietPlanRecord) => {
    if (!orgId) return;
    const result = await cloneDietPlanToDraft(orgId, row.id);
    if (result.error) {
      toast({
        title: "Could not create draft from plan",
        description: result.error.message,
        variant: "error",
      });
      return;
    }
    toast({
      title: "New draft plan created",
      description: "Existing plan remains unchanged. You can now edit the new draft.",
      variant: "success",
    });
    if (result.data?.id) {
      router.push(`/fitness/diet-plans/${result.data.id}/edit`);
    } else {
      void load();
    }
  };

  const columns: Column<DietPlanRecord>[] = [
    {
      id: "plan",
      header: "Plan & Goal",
      cell: (row) => (
        <div>
          <Link
            href={`/fitness/diet-plans/${row.id}`}
            className="font-medium text-ink hover:text-primary-700 hover:underline"
          >
            {row.name}
          </Link>
          <div className="flex items-center gap-2 mt-0.5">
            {row.goal && (
              <Badge tone="neutral" className="text-[10px] px-1.5 py-0">
                {row.goal}
              </Badge>
            )}
            {row.dailyCalorieTarget && (
              <span className="text-xs text-neutral-500">
                🔥 {row.dailyCalorieTarget} kcal/day
              </span>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "member",
      header: "Member",
      cell: (row) => (
        <div>
          <Link
            href={`/members/${row.memberId}`}
            className="font-medium text-ink hover:text-primary-700 hover:underline"
          >
            {row.memberName}
          </Link>
          <div className="flex items-center gap-1.5 text-xs text-neutral-500">
            {row.memberCode && <span>{row.memberCode}</span>}
            {row.memberPhone && (
              <>
                <span>•</span>
                <span>{row.memberPhone}</span>
              </>
            )}
          </div>
        </div>
      ),
    },
    {
      id: "dates",
      header: "Validity",
      cell: (row) => (
        <div className="text-xs text-neutral-600">
          <div>{formatDate(row.startDate)}</div>
          {row.endDate && <div className="text-neutral-400">to {formatDate(row.endDate)}</div>}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      cell: (row) => {
        if (row.status === "active") {
          return (
            <Badge className="bg-teal-100 text-teal-800 border-teal-200">
              Active / Published
            </Badge>
          );
        }
        if (row.status === "draft") {
          return (
            <Badge className="bg-amber-100 text-amber-800 border-amber-200">
              Draft (Hidden from member)
            </Badge>
          );
        }
        return (
          <Badge tone="neutral" className="text-neutral-600">
            Completed
          </Badge>
        );
      },
    },
    {
      id: "updatedAt",
      header: "Last updated",
      cell: (row) => (
        <span className="text-xs text-neutral-500">{formatDate(row.updatedAt)}</span>
      ),
    },
    {
      id: "actions",
      header: "Actions",
      align: "right",
      cell: (row) => {
        return (
          <RowActions
            items={[
              {
                label: "View details",
                href: `/fitness/diet-plans/${row.id}`,
              },
              {
                label: "Edit plan",
                href: `/fitness/diet-plans/${row.id}/edit`,
              },
              {
                label: "Clone as new draft",
                onClick: () => void handleClone(row),
              },
              ...(row.status === "draft"
                ? [
                    {
                      label: "Publish plan",
                      onClick: () => setPublishRow(row),
                    },
                  ]
                : []),
              ...(row.status === "active"
                ? [
                    {
                      label: "Mark completed",
                      onClick: () => setCompleteRow(row),
                    },
                  ]
                : []),
              {
                label: "View member profile",
                href: `/members/${row.memberId}`,
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
        title="Diet plans"
        description="Design and manage customized nutrition planning, daily targets, and meal schedules."
        icon={Salad}
        actions={
          <Button
            onClick={() => router.push("/fitness/diet-plans/add")}
            className="bg-[#0E8F8B] hover:bg-[#063C3B]"
          >
            <Plus className="mr-1.5 size-4" />
            Create Diet Plan
          </Button>
        }
      />

      {/* Metrics Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Active Plans</span>
            <CheckCircle className="size-4 text-teal-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{summary.active}</p>
          <span className="text-[11px] text-teal-600">Published to members</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Draft Plans</span>
            <FileText className="size-4 text-amber-600" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{summary.draft}</p>
          <span className="text-[11px] text-amber-600">Hidden from members</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Completed Plans</span>
            <Clock className="size-4 text-neutral-500" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{summary.completed}</p>
          <span className="text-[11px] text-neutral-500">Past history</span>
        </Card>

        <Card className="p-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-neutral-500">Total Plans</span>
            <Salad className="size-4 text-[#0E8F8B]" />
          </div>
          <p className="mt-2 text-2xl font-bold text-ink">{summary.total}</p>
          <span className="text-[11px] text-neutral-500">Across all statuses</span>
        </Card>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <SearchBar
          value={search}
          onValueChange={setSearch}
          placeholder="Search by plan name, member name, or code…"
        />

        <FilterBar>
          <Select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            options={[
              { value: "all", label: "All statuses" },
              { value: "active", label: "Active / Published" },
              { value: "draft", label: "Draft" },
              { value: "completed", label: "Completed" },
            ]}
            className="w-44"
          />

          <Select
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            options={[
              { value: "all", label: "All goals" },
              ...DIET_PLAN_GOALS.map((g) => ({ value: g, label: g })),
            ]}
            className="w-44"
          />
        </FilterBar>
      </div>

      {/* Table */}
      {error ? (
        <ErrorState description={error} onRetry={() => void load()} />
      ) : rows.length === 0 && !loading ? (
        <EmptyState
          icon={Salad}
          title="No diet plans found"
          description={
            status !== "all" || goal !== "all" || search
              ? "No diet plans matched your filters. Try resetting search or filters."
              : "Create a diet plan with personalized nutrition targets and meal schedules."
          }
          action={{
            label: "Create Diet Plan",
            href: "/fitness/diet-plans/add",
          }}
        />
      ) : (
        <DataTable<DietPlanRecord>
          data={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={loading}
        />
      )}

      {/* Publish Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(publishRow)}
        onClose={() => setPublishRow(null)}
        onConfirm={() => void handlePublish()}
        isLoading={publishSaving}
        title="Publish diet plan?"
        description={`This will make "${publishRow?.name}" the current active diet plan for ${publishRow?.memberName}. Any previous active plan will be archived into history.`}
        confirmLabel="Publish Plan"
      />

      {/* Mark Completed Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(completeRow)}
        onClose={() => setCompleteRow(null)}
        onConfirm={() => void handleComplete()}
        isLoading={completeSaving}
        title="Mark diet plan as completed?"
        description={`Mark "${completeRow?.name}" as completed. It will remain in ${completeRow?.memberName}'s read-only past history.`}
        confirmLabel="Mark Completed"
      />
    </div>
  );
}
