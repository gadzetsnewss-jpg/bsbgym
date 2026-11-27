"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Salad,
  ArrowLeft,
  Edit,
  Send,
  CheckCircle,
  Printer,
  Clock,
  Droplets,
  Calendar,
  User,
  AlertCircle,
  Copy,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import {
  fetchDietPlanById,
  publishDietPlan,
  completeDietPlan,
  cloneDietPlanToDraft,
  groupItemsByMeal,
  calculateNutritionSummary,
  type DietPlanRecord,
} from "@/lib/fitness/diet-plans";

export function DietPlanDetailView({ id }: { id: string }) {
  const router = useRouter();
  const { toast } = useToast();
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [plan, setPlan] = React.useState<DietPlanRecord | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [publishDialogOpen, setPublishDialogOpen] = React.useState(false);
  const [publishSaving, setPublishSaving] = React.useState(false);

  const [completeDialogOpen, setCompleteDialogOpen] = React.useState(false);
  const [completeSaving, setCompleteSaving] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDietPlanById(orgId, id);
    setLoading(false);

    if (result.error) {
      setError(result.error.message);
      return;
    }
    setPlan(result.data);
  }, [orgId, id]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handlePublish = async () => {
    setPublishSaving(true);
    const result = await publishDietPlan(id);
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
      description: "Plan is now active and published to the member.",
      variant: "success",
    });
    setPublishDialogOpen(false);
    void load();
  };

  const handleComplete = async () => {
    setCompleteSaving(true);
    const result = await completeDietPlan(id);
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
    setCompleteDialogOpen(false);
    void load();
  };

  const [cloning, setCloning] = React.useState(false);

  const handleClone = async () => {
    if (!orgId || !plan) return;
    setCloning(true);
    const result = await cloneDietPlanToDraft(orgId, plan.id);
    setCloning(false);

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

  if (loading) return <LoadingState label="Loading diet plan details…" />;
  if (error || !plan) {
    return <ErrorState description={error || "Diet plan not found"} onRetry={() => void load()} />;
  }

  const mealGroups = groupItemsByMeal(plan.items);
  const nutritionSummary = calculateNutritionSummary(plan.items);

  return (
    <div className="space-y-6">
      <PageHeader
        title={plan.name}
        description={`Diet plan assigned to ${plan.memberName || "member"}`}
        icon={Salad}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/fitness/diet-plans")}
            >
              <ArrowLeft className="mr-1.5 size-4" />
              All Plans
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.print()}
            >
              <Printer className="mr-1.5 size-4" />
              Print
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleClone}
              isLoading={cloning}
            >
              <Copy className="mr-1.5 size-4" />
              Clone as Draft
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push(`/fitness/diet-plans/${plan.id}/edit`)}
            >
              <Edit className="mr-1.5 size-4" />
              {plan.status === "draft" ? "Edit Plan" : "Edit as New Draft"}
            </Button>
            {plan.status === "draft" && (
              <Button
                size="sm"
                onClick={() => setPublishDialogOpen(true)}
                className="bg-[#0E8F8B] hover:bg-[#063C3B]"
              >
                <Send className="mr-1.5 size-4" />
                Publish Plan
              </Button>
            )}
            {plan.status === "active" && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCompleteDialogOpen(true)}
              >
                <CheckCircle className="mr-1.5 size-4" />
                Mark Completed
              </Button>
            )}
          </div>
        }
      />

      {/* Hero Banner */}
      <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-sm">
        <div className="bg-gradient-to-r from-[#063C3B] to-[#0E8F8B] p-6 text-white">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                {plan.goal && (
                  <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-xs font-semibold">
                    {plan.goal}
                  </Badge>
                )}
                {plan.status === "active" ? (
                  <span className="rounded-full bg-teal-800/60 px-2.5 py-0.5 text-xs text-teal-100">
                    Active / Published
                  </span>
                ) : plan.status === "draft" ? (
                  <span className="rounded-full bg-amber-800/60 px-2.5 py-0.5 text-xs text-amber-100">
                    Draft (Hidden from member)
                  </span>
                ) : (
                  <span className="rounded-full bg-neutral-800/60 px-2.5 py-0.5 text-xs text-neutral-300">
                    Completed
                  </span>
                )}
              </div>

              <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                {plan.name}
              </h1>

              <div className="flex flex-wrap items-center gap-3 text-xs text-teal-100">
                <span>
                  Member: <strong className="text-white">{plan.memberName}</strong>
                  {plan.memberCode ? ` (${plan.memberCode})` : ""}
                </span>
                <span>•</span>
                <span>
                  Trainer: <strong className="text-white">{plan.trainerName || "Unassigned"}</strong>
                </span>
                <span>•</span>
                <span>
                  Validity: {formatDate(plan.startDate)} {plan.endDate ? `to ${formatDate(plan.endDate)}` : ""}
                </span>
              </div>
            </div>

            <div className="rounded-xl bg-white/10 p-3.5 text-right backdrop-blur-sm border border-white/10">
              <span className="text-[11px] font-medium text-teal-100 uppercase tracking-wider">Daily Target</span>
              <p className="text-2xl font-black text-white">
                {plan.dailyCalorieTarget ? `${plan.dailyCalorieTarget} kcal` : `${nutritionSummary.totalCalories} kcal`}
              </p>
              <span className="text-xs text-teal-200 flex items-center justify-end gap-1 mt-0.5">
                <Droplets className="size-3.5" />
                {plan.waterIntakeLiters ? `${plan.waterIntakeLiters} L water / day` : "Hydration"}
              </span>
            </div>
          </div>
        </div>

        <div className="p-6 space-y-6">
          {/* Targets & Planned Macros Card */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 text-center">
              <span className="text-xs font-medium text-neutral-500">Planned Calories</span>
              <p className="mt-1 text-lg font-bold text-ink">{nutritionSummary.totalCalories} kcal</p>
              {plan.dailyCalorieTarget && (
                <span className="text-[11px] text-neutral-400">
                  Target: {plan.dailyCalorieTarget} kcal
                </span>
              )}
            </div>

            <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-center">
              <span className="text-xs font-medium text-teal-700">Planned Protein</span>
              <p className="mt-1 text-lg font-bold text-teal-900">{nutritionSummary.totalProtein}g</p>
              {plan.proteinTargetG != null && (
                <span className="text-[11px] text-teal-600">
                  Target: {plan.proteinTargetG}g
                </span>
              )}
            </div>

            <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
              <span className="text-xs font-medium text-amber-700">Planned Carbs</span>
              <p className="mt-1 text-lg font-bold text-amber-900">{nutritionSummary.totalCarbs}g</p>
              {plan.carbTargetG != null && (
                <span className="text-[11px] text-amber-600">
                  Target: {plan.carbTargetG}g
                </span>
              )}
            </div>

            <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-center">
              <span className="text-xs font-medium text-rose-700">Planned Fat</span>
              <p className="mt-1 text-lg font-bold text-rose-900">{nutritionSummary.totalFat}g</p>
              {plan.fatTargetG != null && (
                <span className="text-[11px] text-rose-600">
                  Target: {plan.fatTargetG}g
                </span>
              )}
            </div>
          </div>

          {/* Notes */}
          {plan.notes && (
            <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
              <h4 className="text-xs font-bold uppercase tracking-wider text-[#063C3B]">
                Trainer instructions & guidance
              </h4>
              <p className="mt-1 text-sm text-neutral-700 whitespace-pre-line leading-relaxed">
                {plan.notes}
              </p>
            </div>
          )}

          {/* Meal Schedule */}
          <div className="space-y-4">
            <h3 className="text-base font-bold text-ink">Meal Schedule</h3>

            {mealGroups.length === 0 ? (
              <p className="text-xs text-neutral-400">No scheduled meals added to this plan.</p>
            ) : (
              <div className="space-y-4">
                {mealGroups.map((group, idx) => (
                  <div
                    key={group.id}
                    className="rounded-xl border border-neutral-200 bg-white p-4.5 shadow-2xs"
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
            )}
          </div>
        </div>
      </div>

      {/* Publish Dialog */}
      <ConfirmDialog
        open={publishDialogOpen}
        onClose={() => setPublishDialogOpen(false)}
        onConfirm={() => void handlePublish()}
        isLoading={publishSaving}
        title="Publish diet plan?"
        description={`This will make "${plan.name}" the active diet plan for ${plan.memberName}. Any prior active plan will be archived into history.`}
        confirmLabel="Publish Plan"
      />

      {/* Complete Dialog */}
      <ConfirmDialog
        open={completeDialogOpen}
        onClose={() => setCompleteDialogOpen(false)}
        onConfirm={() => void handleComplete()}
        isLoading={completeSaving}
        title="Mark diet plan as completed?"
        description={`Mark "${plan.name}" as completed. It will remain in read-only past history.`}
        confirmLabel="Mark Completed"
      />
    </div>
  );
}
