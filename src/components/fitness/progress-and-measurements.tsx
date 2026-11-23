"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import {
  CalendarDays,
  Dumbbell,
  LineChart,
  Plus,
  Scale,
  TrendingDown,
  TrendingUp,
  UserRound,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Tabs } from "@/components/ui/tabs";
import { Select, type SelectOption } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchLinkedTrainerId,
  fetchMemberMeasurements,
  fetchMemberProgress,
  fetchTrainerAssignedMembers,
  type MemberMeasurementRow,
  type MemberProgressRow,
} from "@/lib/org/gym-members";
import { loadMemberOptions } from "@/lib/operations/adapters";
import { formatDate } from "@/lib/format";

export function ProgressAndMeasurementsScreen() {
  const searchParams = useSearchParams();
  const initialMemberId = searchParams.get("memberId") || "";

  const { organization, profile, hasRole } = useOrganization();
  const orgId = organization?.id;
  const isTrainer = hasRole(["trainer"]);

  const [members, setMembers] = React.useState<SelectOption[]>([]);
  const [selectedMemberId, setSelectedMemberId] = React.useState(initialMemberId);
  const [unauthorized, setUnauthorized] = React.useState(false);

  const [activeTab, setActiveTab] = React.useState("measurements");
  const [measurements, setMeasurements] = React.useState<MemberMeasurementRow[]>([]);
  const [progress, setProgress] = React.useState<MemberProgressRow[]>([]);
  const [loadingMembers, setLoadingMembers] = React.useState(true);
  const [loadingData, setLoadingData] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Load authorized members for selector
  React.useEffect(() => {
    if (!orgId) return;
    const organizationId = orgId;
    let active = true;

    async function loadMembers() {
      setLoadingMembers(true);
      setError(null);

      if (isTrainer && profile?.id) {
        const linked = await fetchLinkedTrainerId(organizationId, profile.id);
        if (!active) return;
        if (!linked.data) {
          setMembers([]);
          setLoadingMembers(false);
          return;
        }

        const result = await fetchTrainerAssignedMembers(organizationId, linked.data);
        if (!active) return;
        if (result.error) {
          setError(result.error.message);
          setLoadingMembers(false);
          return;
        }

        const activeAssigned = result.data.filter((row) => row.status === "active");
        const options: SelectOption[] = activeAssigned.map((row) => ({
          value: row.memberId,
          label: row.memberName,
        }));
        setMembers(options);

        // Security check: if an initial memberId was passed via URL, ensure it is assigned
        if (initialMemberId) {
          const isAssigned = options.some((opt) => opt.value === initialMemberId);
          if (!isAssigned) {
            setUnauthorized(true);
            setSelectedMemberId("");
          } else {
            setSelectedMemberId(initialMemberId);
          }
        } else if (options.length > 0) {
          setSelectedMemberId(options[0].value);
        }
      } else {
        const options = await loadMemberOptions(organizationId);
        if (!active) return;
        setMembers(options);
        if (initialMemberId) {
          setSelectedMemberId(initialMemberId);
        } else if (options.length > 0) {
          setSelectedMemberId(options[0].value);
        }
      }
      setLoadingMembers(false);
    }

    void loadMembers();

    return () => {
      active = false;
    };
  }, [orgId, isTrainer, profile?.id, initialMemberId]);

  // Load measurements and progress for selected member
  const loadData = React.useCallback(async () => {
    if (!orgId || !selectedMemberId) {
      setMeasurements([]);
      setProgress([]);
      return;
    }

    setLoadingData(true);
    setError(null);
    const [measResult, progResult] = await Promise.all([
      fetchMemberMeasurements(orgId, selectedMemberId),
      fetchMemberProgress(orgId, selectedMemberId),
    ]);
    setLoadingData(false);

    if (measResult.error) {
      setError(measResult.error.message);
      return;
    }
    if (progResult.error) {
      setError(progResult.error.message);
      return;
    }

    setMeasurements(measResult.data);
    setProgress(progResult.data);
  }, [orgId, selectedMemberId]);

  React.useEffect(() => {
    void loadData();
  }, [loadData]);

  if (unauthorized) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Progress & Measurements"
          description="View body measurements and fitness progress entries."
          icon={LineChart}
        />
        <ErrorState
          title="Access Denied"
          description="You are only permitted to view progress and measurements for members actively assigned to your training schedule."
          onRetry={() => setUnauthorized(false)}
        />
      </div>
    );
  }

  // Trend summary computations
  const weights = measurements
    .map((m) => m.weightKg)
    .filter((w): w is number => w != null);
  const latestMeasurement = measurements[0] ?? null;
  const oldestMeasurement = measurements[measurements.length - 1] ?? null;

  const currentWeight = latestMeasurement?.weightKg ?? (progress[0]?.weightKg ?? null);
  const startingWeight = oldestMeasurement?.weightKg ?? (progress[progress.length - 1]?.weightKg ?? null);
  const weightChange =
    currentWeight != null && startingWeight != null ? currentWeight - startingWeight : null;

  const selectedMemberName =
    members.find((m) => m.value === selectedMemberId)?.label ?? "Selected Member";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Progress & Measurements"
        description="Comprehensive member body composition, measurements history, and progress logs."
        icon={LineChart}
        actions={
          selectedMemberId ? (
            <div className="flex flex-wrap items-center gap-2">
              <ButtonLink
                href={`/fitness/measurements/add?memberId=${selectedMemberId}`}
                variant="primary"
                size="sm"
              >
                <Plus aria-hidden="true" className="mr-1.5 size-4" />
                Record Measurement
              </ButtonLink>
              <ButtonLink
                href={`/fitness/progress/add?memberId=${selectedMemberId}`}
                variant="outline"
                size="sm"
              >
                <Plus aria-hidden="true" className="mr-1.5 size-4" />
                Add Progress Entry
              </ButtonLink>
            </div>
          ) : undefined
        }
      />

      {/* Member Selector Bar */}
      <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <label htmlFor="member-select" className="text-sm font-semibold text-ink">
            Member:
          </label>
          {loadingMembers ? (
            <span className="text-xs text-neutral-500">Loading members…</span>
          ) : members.length === 0 ? (
            <span className="text-xs text-neutral-500">
              {isTrainer ? "No assigned members found." : "No active members found."}
            </span>
          ) : (
            <Select
              id="member-select"
              aria-label="Select member"
              className="w-64"
              value={selectedMemberId}
              onChange={(e) => setSelectedMemberId(e.target.value)}
              options={members}
            />
          )}
        </div>

        {selectedMemberId && (
          <div className="flex items-center gap-2">
            <ButtonLink href={`/members/${selectedMemberId}`} variant="ghost" size="sm">
              View Profile &rarr;
            </ButtonLink>
          </div>
        )}
      </Card>

      {error && <ErrorState description={error} onRetry={() => void loadData()} />}

      {!selectedMemberId ? (
        <EmptyState
          icon={UserRound}
          title="No Member Selected"
          description="Select a member from the dropdown above to view their measurements and progress entries."
        />
      ) : loadingData ? (
        <LoadingState label="Loading fitness records…" />
      ) : (
        <>
          {/* Trend Summary Cards */}
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-teal-50 p-2.5 text-teal-700">
                  <Scale className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Current Weight</p>
                  <p className="text-2xl font-bold text-ink">
                    {currentWeight != null ? `${currentWeight} kg` : "—"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-sky-50 p-2.5 text-sky-700">
                  {weightChange == null || weightChange === 0 ? (
                    <Scale className="size-5" />
                  ) : weightChange < 0 ? (
                    <TrendingDown className="size-5 text-emerald-600" />
                  ) : (
                    <TrendingUp className="size-5 text-amber-600" />
                  )}
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Net Weight Change</p>
                  <p className="text-2xl font-bold text-ink">
                    {weightChange != null
                      ? `${weightChange > 0 ? "+" : ""}${weightChange.toFixed(1)} kg`
                      : "—"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-700">
                  <Dumbbell className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Body Fat %</p>
                  <p className="text-2xl font-bold text-ink">
                    {latestMeasurement?.bodyFatPercent != null
                      ? `${latestMeasurement.bodyFatPercent}%`
                      : "—"}
                  </p>
                </div>
              </div>
            </Card>

            <Card className="p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-lg bg-purple-50 p-2.5 text-purple-700">
                  <LineChart className="size-5" />
                </div>
                <div>
                  <p className="text-xs font-medium text-neutral-500">Waist</p>
                  <p className="text-2xl font-bold text-ink">
                    {latestMeasurement?.waistCm != null ? `${latestMeasurement.waistCm} cm` : "—"}
                  </p>
                </div>
              </div>
            </Card>
          </div>

          {/* Sub-Tabs: Measurements vs Progress Entries */}
          <Tabs
            aria-label="Progress & Measurements sections"
            value={activeTab}
            onValueChange={setActiveTab}
            items={[
              { value: "measurements", label: "Body Measurements", icon: Scale },
              { value: "progress", label: "Progress Entries", icon: LineChart },
            ]}
          >
            {activeTab === "measurements" && (
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Measurement History &middot; {selectedMemberName}
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Track changes in weight, body fat, chest, waist, hips, arms, and thighs.
                    </p>
                  </div>
                  <ButtonLink
                    href={`/fitness/measurements/add?memberId=${selectedMemberId}`}
                    variant="primary"
                    size="sm"
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Record Measurement
                  </ButtonLink>
                </div>

                {measurements.length === 0 ? (
                  <EmptyState
                    icon={Scale}
                    title="No measurements recorded"
                    description={`No body measurements recorded yet for ${selectedMemberName}.`}
                  />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-sm text-ink">
                      <thead className="border-b border-neutral-200 bg-neutral-50/50 text-xs font-semibold text-neutral-500 uppercase">
                        <tr>
                          <th className="px-3 py-2.5">Date</th>
                          <th className="px-3 py-2.5">Weight</th>
                          <th className="px-3 py-2.5">Body Fat</th>
                          <th className="px-3 py-2.5">Chest</th>
                          <th className="px-3 py-2.5">Waist</th>
                          <th className="px-3 py-2.5">Hips</th>
                          <th className="px-3 py-2.5">Arms</th>
                          <th className="px-3 py-2.5">Thighs</th>
                          <th className="px-3 py-2.5">Notes</th>
                          <th className="px-3 py-2.5 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-neutral-200/60">
                        {measurements.map((row) => (
                          <tr key={row.id} className="hover:bg-neutral-50/50">
                            <td className="px-3 py-2.5 font-medium whitespace-nowrap">
                              {formatDate(row.measuredAt)}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.weightKg != null ? `${row.weightKg} kg` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.bodyFatPercent != null ? `${row.bodyFatPercent}%` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.chestCm != null ? `${row.chestCm} cm` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.waistCm != null ? `${row.waistCm} cm` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.hipsCm != null ? `${row.hipsCm} cm` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.armsCm != null ? `${row.armsCm} cm` : "—"}
                            </td>
                            <td className="px-3 py-2.5 whitespace-nowrap">
                              {row.thighsCm != null ? `${row.thighsCm} cm` : "—"}
                            </td>
                            <td className="max-w-xs truncate px-3 py-2.5 text-xs text-neutral-500">
                              {row.notes || "—"}
                            </td>
                            <td className="px-3 py-2.5 text-right whitespace-nowrap">
                              <div className="flex items-center justify-end gap-2">
                                <ButtonLink
                                  href={`/fitness/measurements/${row.id}`}
                                  variant="ghost"
                                  size="sm"
                                >
                                  View
                                </ButtonLink>
                                <ButtonLink
                                  href={`/fitness/measurements/${row.id}/edit`}
                                  variant="outline"
                                  size="sm"
                                >
                                  Edit
                                </ButtonLink>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            )}

            {activeTab === "progress" && (
              <Card className="space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-200/70 pb-3">
                  <div>
                    <h2 className="text-base font-semibold text-ink">
                      Progress Entries &middot; {selectedMemberName}
                    </h2>
                    <p className="text-xs text-neutral-500">
                      Periodic weight logs and progress notes.
                    </p>
                  </div>
                  <ButtonLink
                    href={`/fitness/progress/add?memberId=${selectedMemberId}`}
                    variant="primary"
                    size="sm"
                  >
                    <Plus className="mr-1.5 size-3.5" />
                    Add Progress Entry
                  </ButtonLink>
                </div>

                {progress.length === 0 ? (
                  <EmptyState
                    icon={CalendarDays}
                    title="No progress entries recorded"
                    description={`No progress entries logged yet for ${selectedMemberName}.`}
                  />
                ) : (
                  <div className="space-y-3">
                    {progress.map((row) => (
                      <div
                        key={row.id}
                        className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-neutral-200/70 p-3 hover:bg-neutral-50/50"
                      >
                        <div className="space-y-1">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-ink">{formatDate(row.entryDate)}</span>
                            {row.weightKg != null && (
                              <span className="rounded bg-teal-50 px-2 py-0.5 text-xs font-medium text-teal-800">
                                {row.weightKg} kg
                              </span>
                            )}
                          </div>
                          {row.notes && (
                            <p className="text-xs text-neutral-600">{row.notes}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <ButtonLink
                            href={`/fitness/progress/${row.id}`}
                            variant="ghost"
                            size="sm"
                          >
                            View
                          </ButtonLink>
                          <ButtonLink
                            href={`/fitness/progress/${row.id}/edit`}
                            variant="outline"
                            size="sm"
                          >
                            Edit
                          </ButtonLink>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}
          </Tabs>
        </>
      )}
    </div>
  );
}
