"use client";

import * as React from "react";
import Link from "next/link";
import {
  Salad,
  Clock,
  Flame,
  Droplets,
  Calendar,
  User,
  History,
  FileText,
  AlertCircle,
  Printer,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/ui/loading-state";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { formatDate } from "@/lib/format";
import {
  fetchMemberCurrentDietPlan,
  fetchMemberDietPlanHistory,
  groupItemsByMeal,
  calculateNutritionSummary,
  type DietPlanRecord,
} from "@/lib/fitness/diet-plans";
import { fetchLinkedGymMemberId } from "@/lib/org/gym-members";

export function MemberDietPlanView() {
  const { organization, profile } = useOrganization();
  const orgId = organization?.id;
  const userId = profile?.id;

  const [activePlan, setActivePlan] = React.useState<DietPlanRecord | null>(null);
  const [historyPlans, setHistoryPlans] = React.useState<DietPlanRecord[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [showHistory, setShowHistory] = React.useState(false);
  const [expandedHistoryId, setExpandedHistoryId] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);

    // Resolve linked member id
    const memberRes = await fetchLinkedGymMemberId(orgId, userId);
    if (memberRes.error) {
      setError(memberRes.error.message);
      setLoading(false);
      return;
    }

    const memberId = memberRes.data;
    if (!memberId) {
      setError("No gym member profile linked to this account.");
      setLoading(false);
      return;
    }

    const [currentRes, historyRes] = await Promise.all([
      fetchMemberCurrentDietPlan(orgId, memberId),
      fetchMemberDietPlanHistory(orgId, memberId),
    ]);

    setLoading(false);

    if (currentRes.error) {
      setError(currentRes.error.message);
      return;
    }

    setActivePlan(currentRes.data);
    setHistoryPlans(historyRes.data ?? []);
  }, [orgId, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (loading) return <LoadingState label="Loading your personalized diet plan…" />;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;

  if (!activePlan && historyPlans.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="My Diet Plan"
          description="Your personalized nutrition guidelines and daily dietary plan."
          icon={Salad}
        />
        <EmptyState
          icon={Salad}
          title="No active diet plan yet"
          description="Your assigned personal trainer will design and publish your personalized nutrition schedule here."
        />
      </div>
    );
  }

  const mealGroups = activePlan ? groupItemsByMeal(activePlan.items) : [];
  const nutritionSummary = activePlan ? calculateNutritionSummary(activePlan.items) : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="My Diet Plan"
        description="Your personalized nutrition targets, daily meal timings, and dietary guidelines."
        icon={Salad}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
              className="print:hidden"
            >
              <Printer className="mr-1.5 size-4" />
              Print Plan
            </Button>
            {historyPlans.length > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowHistory(!showHistory)}
                className="print:hidden"
              >
                <History className="mr-1.5 size-4" />
                {showHistory ? "Hide Past Plans" : `Past Plans (${historyPlans.length})`}
              </Button>
            )}
          </div>
        }
      />

      {/* Active Published Plan */}
      {activePlan ? (
        <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
          {/* Header Banner */}
          <div className="bg-gradient-to-r from-[#063C3B] to-[#0E8F8B] p-6 text-white">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  {activePlan.goal && (
                    <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-xs font-semibold">
                      {activePlan.goal}
                    </Badge>
                  )}
                  <span className="rounded-full bg-teal-800/60 px-2.5 py-0.5 text-xs text-teal-100">
                    Active Plan
                  </span>
                </div>
                <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                  {activePlan.name}
                </h1>
                <p className="text-xs text-teal-100 flex flex-wrap items-center gap-2">
                  {activePlan.trainerName && (
                    <span>Prepared by Trainer: <strong className="text-white">{activePlan.trainerName}</strong></span>
                  )}
                  <span>•</span>
                  <span>
                    Valid: {formatDate(activePlan.startDate)} {activePlan.endDate ? `to ${formatDate(activePlan.endDate)}` : ""}
                  </span>
                </p>
              </div>

              {/* Water & Calorie Targets Card */}
              <div className="rounded-xl bg-white/10 p-3.5 text-right backdrop-blur-sm border border-white/10">
                <span className="text-[11px] font-medium text-teal-100 uppercase tracking-wider">Daily Target</span>
                <p className="text-2xl font-black text-white">
                  {activePlan.dailyCalorieTarget
                    ? `${activePlan.dailyCalorieTarget} kcal`
                    : nutritionSummary
                      ? `${nutritionSummary.totalCalories} kcal`
                      : "—"}
                </p>
                <span className="text-xs text-teal-200 flex items-center justify-end gap-1 mt-0.5">
                  <Droplets className="size-3.5" />
                  {activePlan.waterIntakeLiters ? `${activePlan.waterIntakeLiters} L water / day` : "Stay well hydrated"}
                </span>
              </div>
            </div>
          </div>

          <div className="p-6 space-y-6">
            {/* Daily Nutrition Targets & Planned Comparison */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 text-center">
                <span className="text-xs font-medium text-neutral-500">Planned Calories</span>
                <p className="mt-1 text-lg font-bold text-ink">
                  {nutritionSummary?.totalCalories ?? "—"} kcal
                </p>
                {activePlan.dailyCalorieTarget && (
                  <span className="text-[11px] text-neutral-400">
                    Target: {activePlan.dailyCalorieTarget} kcal
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-center">
                <span className="text-xs font-medium text-teal-700">Planned Protein</span>
                <p className="mt-1 text-lg font-bold text-teal-900">
                  {nutritionSummary?.totalProtein ?? "—"}g
                </p>
                {activePlan.proteinTargetG != null && (
                  <span className="text-[11px] text-teal-600">
                    Target: {activePlan.proteinTargetG}g
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
                <span className="text-xs font-medium text-amber-700">Planned Carbs</span>
                <p className="mt-1 text-lg font-bold text-amber-900">
                  {nutritionSummary?.totalCarbs ?? "—"}g
                </p>
                {activePlan.carbTargetG != null && (
                  <span className="text-[11px] text-amber-600">
                    Target: {activePlan.carbTargetG}g
                  </span>
                )}
              </div>

              <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-center">
                <span className="text-xs font-medium text-rose-700">Planned Fat</span>
                <p className="mt-1 text-lg font-bold text-rose-900">
                  {nutritionSummary?.totalFat ?? "—"}g
                </p>
                {activePlan.fatTargetG != null && (
                  <span className="text-[11px] text-rose-600">
                    Target: {activePlan.fatTargetG}g
                  </span>
                )}
              </div>
            </div>

            {/* Trainer Notes Callout */}
            {activePlan.notes && (
              <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
                <h4 className="text-xs font-bold uppercase tracking-wider text-[#063C3B]">
                  Trainer guidelines & advice
                </h4>
                <p className="mt-1 text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
                  {activePlan.notes}
                </p>
              </div>
            )}

            {/* Chronological Meals Timeline */}
            <div className="space-y-4">
              <h3 className="text-base font-bold text-ink">Today&apos;s Meal Schedule</h3>

              <div className="space-y-4">
                {mealGroups.map((group, idx) => (
                  <div
                    key={group.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4.5 shadow-2xs transition-all hover:border-teal-200"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-3">
                      <div className="flex items-center gap-3">
                        <span className="flex size-7 items-center justify-center rounded-full bg-[#0E8F8B] text-xs font-bold text-white shadow-xs">
                          {idx + 1}
                        </span>
                        <div>
                          <h4 className="text-base font-bold text-ink">{group.meal}</h4>
                          {group.mealTime && (
                            <span className="text-xs text-neutral-500 flex items-center gap-1 mt-0.5">
                              <Clock className="size-3 text-neutral-400" />
                              {group.mealTime}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs font-medium">
                        <span className="rounded-md bg-neutral-100 px-2 py-1 text-neutral-700">
                          🔥 {group.totalCalories} kcal
                        </span>
                        <span className="rounded-md bg-teal-50 px-2 py-1 text-teal-700">
                          P: {group.totalProtein}g
                        </span>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-amber-700">
                          C: {group.totalCarbs}g
                        </span>
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-rose-700">
                          F: {group.totalFat}g
                        </span>
                      </div>
                    </div>

                    {group.instructions && (
                      <p className="mt-2.5 text-xs italic text-neutral-600 bg-neutral-50/70 p-2 rounded-lg border border-neutral-100">
                        Tip: {group.instructions}
                      </p>
                    )}

                    <div className="mt-3 divide-y divide-neutral-100">
                      {group.items.map((item, itemIdx) => (
                        <div
                          key={itemIdx}
                          className="flex flex-col gap-1 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-[#0E8F8B]" />
                            <span className="font-semibold text-ink">{item.foodName}</span>
                            {item.quantity && (
                              <span className="text-xs text-neutral-500">
                                ({item.quantity} {item.unit || "g"})
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-3 text-xs text-neutral-600">
                            <span className="font-medium text-neutral-800">
                              {item.calories != null ? `${item.calories} kcal` : "— kcal"}
                            </span>
                            <span className="text-neutral-300">|</span>
                            <span className="text-teal-700">
                              {item.proteinG != null ? `${item.proteinG}g P` : "—"}
                            </span>
                            <span className="text-amber-700">
                              {item.carbsG != null ? `${item.carbsG}g C` : "—"}
                            </span>
                            <span className="text-rose-700">
                              {item.fatG != null ? `${item.fatG}g F` : "—"}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <Card className="text-center py-8">
          <p className="text-sm text-neutral-500">No active diet plan assigned at this moment.</p>
        </Card>
      )}

      {/* Read-Only History Section */}
      {showHistory && historyPlans.length > 0 && (
        <Card className="space-y-4">
          <div className="border-b border-border pb-3">
            <h3 className="text-base font-bold text-ink">Past Diet Plans</h3>
            <p className="text-xs text-neutral-500">
              Read-only history of completed previous nutrition plans.
            </p>
          </div>

          <div className="divide-y divide-neutral-200">
            {historyPlans.map((hp) => (
              <div key={hp.id} className="py-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-ink">{hp.name}</h4>
                    <p className="text-xs text-neutral-500">
                      {hp.goal && `${hp.goal} · `}
                      {formatDate(hp.startDate)} to {formatDate(hp.endDate)}
                    </p>
                  </div>
                  <Badge tone="neutral" className="text-neutral-500">
                    Completed
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
