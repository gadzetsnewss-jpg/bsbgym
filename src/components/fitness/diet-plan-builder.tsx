"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  Salad,
  Plus,
  Trash2,
  ChevronRight,
  ChevronLeft,
  Check,
  Calendar,
  Clock,
  Flame,
  Droplets,
  AlertCircle,
  Eye,
  Send,
  FileText,
  User,
  ArrowUp,
  ArrowDown,
  Sparkles,
} from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormField } from "@/components/ui/form-field";
import { Badge } from "@/components/ui/badge";
import { LoadingState } from "@/components/ui/loading-state";
import { ErrorState } from "@/components/ui/error-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { fetchLinkedTrainerId, fetchTrainerAssignedMembers } from "@/lib/org/gym-members";
import { loadMemberOptions } from "@/lib/operations/adapters";
import {
  DIET_PLAN_GOALS,
  STANDARD_MEALS,
  COMMON_UNITS,
  calculateNutritionSummary,
  fetchDietPlanById,
  saveFullDietPlan,
  publishDietPlan,
  type DietPlanGoal,
  type DietPlanStatus,
  type DietFoodItem,
} from "@/lib/fitness/diet-plans";

interface DietPlanBuilderProps {
  mode: "create" | "edit";
  id?: string;
}

export function DietPlanBuilder({ mode, id }: DietPlanBuilderProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { organization, profile, hasRole } = useOrganization();
  const orgId = organization?.id;
  const isTrainer = hasRole(["trainer"]);

  // Multi-step state: 1: Details, 2: Goals, 3: Meal Schedule, 4: Preview & Publish
  const [currentStep, setCurrentStep] = React.useState<1 | 2 | 3 | 4>(1);

  // Form states
  const [planName, setPlanName] = React.useState("");
  const [goal, setGoal] = React.useState<DietPlanGoal>("General Fitness");
  const [memberId, setMemberId] = React.useState("");
  const [trainerId, setTrainerId] = React.useState<string | null>(null);
  const [trainerName, setTrainerName] = React.useState("");
  const [startDate, setStartDate] = React.useState(
    new Date().toISOString().split("T")[0],
  );
  const [endDate, setEndDate] = React.useState("");
  const [notes, setNotes] = React.useState("");

  // Targets
  const [targetCalories, setTargetCalories] = React.useState("");
  const [targetProtein, setTargetProtein] = React.useState("");
  const [targetCarbs, setTargetCarbs] = React.useState("");
  const [targetFat, setTargetFat] = React.useState("");
  const [targetWater, setTargetWater] = React.useState("3.0");

  // Meals and food items
  const [items, setItems] = React.useState<DietFoodItem[]>([
    {
      meal: "Breakfast",
      mealTime: "08:30",
      foodName: "",
      quantity: 100,
      unit: "g",
      calories: null,
      proteinG: null,
      carbsG: null,
      fatG: null,
      instructions: "",
      sortOrder: 0,
    },
  ]);

  // Options
  const [memberOptions, setMemberOptions] = React.useState<
    Array<{ value: string; label: string; code?: string }>
  >([]);
  const [originalStatus, setOriginalStatus] = React.useState<string | null>(null);
  const [loadingInitial, setLoadingInitial] = React.useState(true);
  const [initialError, setInitialError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);

  // Load members, trainer link, and existing plan if in edit mode
  React.useEffect(() => {
    let active = true;

    async function init() {
      if (!orgId) return;
      setLoadingInitial(true);
      setInitialError(null);

      try {
        let resolvedTrainerId: string | null = null;
        let resolvedTrainerName = [profile?.firstName, profile?.lastName].filter(Boolean).join(" ") || "Trainer";

        if (isTrainer && profile?.id) {
          const tRes = await fetchLinkedTrainerId(orgId, profile.id);
          if (tRes.data) {
            resolvedTrainerId = tRes.data;
          }
        }

        if (active) {
          setTrainerId(resolvedTrainerId);
          setTrainerName(resolvedTrainerName);
        }

        // Load members list: if trainer, show only actively assigned members; else load all active members
        if (isTrainer && resolvedTrainerId) {
          const assignedRes = await fetchTrainerAssignedMembers(orgId, resolvedTrainerId);
          if (active && assignedRes.data) {
            const opts = assignedRes.data.map((m) => ({
              value: m.memberId,
              label: m.memberCode ? `${m.memberName} (${m.memberCode})` : m.memberName,
              code: m.memberCode || undefined,
            }));
            setMemberOptions(opts);
          }
        } else {
          const opts = await loadMemberOptions(orgId);
          if (active) {
            setMemberOptions(opts);
          }
        }

        // Check search params for pre-selected member
        const queryMemberId = searchParams.get("memberId");
        if (queryMemberId && active) {
          setMemberId(queryMemberId);
        }

        // If edit mode, load existing plan
        if (mode === "edit" && id) {
          const planRes = await fetchDietPlanById(orgId, id);
          if (planRes.error) {
            if (active) setInitialError(planRes.error.message);
            return;
          }
          if (planRes.data && active) {
            const p = planRes.data;
            setOriginalStatus(p.status);
            setPlanName(
              p.status === "active" || p.status === "completed"
                ? `${p.name} (Draft)`
                : p.name,
            );
            setGoal(p.goal || "General Fitness");
            setMemberId(p.memberId);
            setTrainerId(p.trainerId);
            if (p.trainerName) setTrainerName(p.trainerName);
            setStartDate(p.startDate || "");
            setEndDate(p.endDate || "");
            setNotes(p.notes || "");
            setTargetCalories(p.dailyCalorieTarget != null ? String(p.dailyCalorieTarget) : "");
            setTargetProtein(p.proteinTargetG != null ? String(p.proteinTargetG) : "");
            setTargetCarbs(p.carbTargetG != null ? String(p.carbTargetG) : "");
            setTargetFat(p.fatTargetG != null ? String(p.fatTargetG) : "");
            setTargetWater(p.waterIntakeLiters != null ? String(p.waterIntakeLiters) : "3.0");
            if (p.items.length > 0) {
              setItems(p.items);
            }
          }
        }
      } catch (err: unknown) {
        if (active) setInitialError((err as Error).message || "Initialization failed");
      } finally {
        if (active) setLoadingInitial(false);
      }
    }

    void init();
    return () => {
      active = false;
    };
  }, [orgId, profile?.id, profile?.firstName, profile?.lastName, isTrainer, mode, id, searchParams]);

  // Derived selected member name
  const selectedMember = memberOptions.find((m) => m.value === memberId);

  // Group items by meal
  const mealNames = React.useMemo(() => {
    const list: string[] = [];
    for (const item of items) {
      if (!list.includes(item.meal)) {
        list.push(item.meal);
      }
    }
    return list;
  }, [items]);

  // Live Nutrition Calculation
  const nutritionSummary = React.useMemo(() => {
    return calculateNutritionSummary(items);
  }, [items]);

  // Daily target totals parsed
  const parsedTargetCalories = targetCalories ? Number(targetCalories) : null;
  const parsedTargetProtein = targetProtein ? Number(targetProtein) : null;
  const parsedTargetCarbs = targetCarbs ? Number(targetCarbs) : null;
  const parsedTargetFat = targetFat ? Number(targetFat) : null;

  // Macro target calorie sum
  const targetMacroCalories =
    (parsedTargetProtein ?? 0) * 4 + (parsedTargetCarbs ?? 0) * 4 + (parsedTargetFat ?? 0) * 9;

  // Validation
  const validateStep1 = () => {
    if (!planName.trim()) {
      toast({ title: "Plan name is required", variant: "error" });
      return false;
    }
    if (!memberId) {
      toast({ title: "Please select a member", variant: "error" });
      return false;
    }
    if (startDate && endDate && endDate < startDate) {
      toast({ title: "End date cannot be before start date", variant: "error" });
      return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (targetCalories && (Number(targetCalories) <= 0 || isNaN(Number(targetCalories)))) {
      toast({ title: "Daily calories must be a valid positive number", variant: "error" });
      return false;
    }
    return true;
  };

  const validateStep3 = () => {
    if (items.length === 0) {
      toast({ title: "Add at least one meal to the diet plan", variant: "error" });
      return false;
    }
    for (const item of items) {
      const m = item.meal.trim();
      const f = item.foodName.trim();
      if (!m || m.toLowerCase() === "meal") {
        toast({
          title: `Please enter a specific meal name (e.g. Breakfast, Lunch, Dinner) instead of "${item.meal}"`,
          variant: "error",
        });
        return false;
      }
      if (!f || f.toLowerCase() === "item") {
        toast({
          title: `Please enter a meaningful food name for meal "${item.meal}"`,
          variant: "error",
        });
        return false;
      }
    }
    return true;
  };

  // Step navigation
  const goToNextStep = () => {
    if (currentStep === 1 && !validateStep1()) return;
    if (currentStep === 2 && !validateStep2()) return;
    if (currentStep === 3 && !validateStep3()) return;
    if (currentStep < 4) setCurrentStep((prev) => (prev + 1) as 2 | 3 | 4);
  };

  const goToPrevStep = () => {
    if (currentStep > 1) setCurrentStep((prev) => (prev - 1) as 1 | 2 | 3);
  };

  // Meal management helpers
  const handleAddMeal = (mealCategory: string) => {
    const defaultTime =
      STANDARD_MEALS.find((m) => m.value === mealCategory)?.defaultTime || "12:00";
    setItems((prev) => [
      ...prev,
      {
        meal: mealCategory,
        mealTime: defaultTime,
        foodName: "",
        quantity: 100,
        unit: "g",
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        instructions: "",
        sortOrder: prev.length,
      },
    ]);
  };

  const handleRenameMeal = (oldMealName: string, newMealName: string) => {
    if (!newMealName.trim()) return;
    setItems((prev) =>
      prev.map((item) =>
        item.meal === oldMealName ? { ...item, meal: newMealName } : item,
      ),
    );
  };

  const handleSetMealTime = (mealName: string, time: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.meal === mealName ? { ...item, mealTime: time } : item,
      ),
    );
  };

  const handleSetMealInstructions = (mealName: string, instructions: string) => {
    setItems((prev) =>
      prev.map((item) =>
        item.meal === mealName ? { ...item, instructions } : item,
      ),
    );
  };

  const handleRemoveMeal = (mealName: string) => {
    setItems((prev) => prev.filter((item) => item.meal !== mealName));
  };

  const handleAddFoodItem = (mealName: string) => {
    const existing = items.filter((i) => i.meal === mealName);
    const mealTime = existing[0]?.mealTime || "12:00";
    const instructions = existing[0]?.instructions || "";

    setItems((prev) => [
      ...prev,
      {
        meal: mealName,
        mealTime,
        foodName: "",
        quantity: 100,
        unit: "g",
        calories: null,
        proteinG: null,
        carbsG: null,
        fatG: null,
        instructions,
        sortOrder: prev.length,
      },
    ]);
  };

  const handleUpdateItem = (
    index: number,
    updates: Partial<DietFoodItem>,
  ) => {
    setItems((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  const handleRemoveItem = (index: number) => {
    setItems((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleMoveItem = (index: number, direction: "up" | "down") => {
    if (
      (direction === "up" && index === 0) ||
      (direction === "down" && index === items.length - 1)
    ) {
      return;
    }
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    setItems((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[targetIdx];
      copy[targetIdx] = temp;
      // Re-index sortOrder
      return copy.map((item, idx) => ({ ...item, sortOrder: idx }));
    });
  };

  // Submit action (Draft or Publish)
  const handleSubmitPlan = async (statusToSet: DietPlanStatus) => {
    if (!orgId) return;
    if (!validateStep1() || !validateStep3()) return;

    if (statusToSet === "active" && items.length === 0) {
      toast({
        title: "Cannot publish empty plan",
        description: "A diet plan must have at least one meal item before it can be published.",
        variant: "error",
      });
      return;
    }

    const isCloningActiveOrCompleted = Boolean(originalStatus && originalStatus !== "draft");
    const planIdToSave = mode === "edit" && !isCloningActiveOrCompleted ? id : undefined;

    setSaving(true);
    // Always persist plan first as draft to ensure data integrity
    const result = await saveFullDietPlan(orgId, {
      id: planIdToSave,
      memberId,
      trainerId: trainerId || null,
      name: planName.trim(),
      goal,
      status: "draft",
      dailyCalorieTarget: targetCalories ? Number(targetCalories) : null,
      proteinTargetG: targetProtein ? Number(targetProtein) : null,
      carbTargetG: targetCarbs ? Number(targetCarbs) : null,
      fatTargetG: targetFat ? Number(targetFat) : null,
      waterIntakeLiters: targetWater ? Number(targetWater) : null,
      startDate: startDate || null,
      endDate: endDate || null,
      notes: notes.trim() || null,
      items,
    });

    if (result.error) {
      setSaving(false);
      toast({
        title: "Could not save diet plan",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    const savedPlanId = result.data?.id || (planIdToSave ? id : undefined);

    // If publishing, route explicitly through the dedicated publish_diet_plan RPC
    if (statusToSet === "active" && savedPlanId) {
      const publishRes = await publishDietPlan(savedPlanId);
      setSaving(false);

      if (publishRes.error) {
        toast({
          title: "Plan saved as draft, but publishing failed",
          description: publishRes.error.message,
          variant: "error",
        });
        return;
      }

      toast({
        title: "Diet plan assigned and published",
        description: `Plan published for ${selectedMember?.label || "member"}.`,
        variant: "success",
      });
    } else {
      setSaving(false);
      toast({
        title: isCloningActiveOrCompleted
          ? "New draft created from plan"
          : mode === "edit"
          ? "Diet plan draft updated"
          : "Diet plan saved as draft",
        description: isCloningActiveOrCompleted
          ? "Saved as a new draft. The active plan remains running until you publish this draft."
          : "Draft is saved and remains hidden from the member until published.",
        variant: "success",
      });
    }

    if (savedPlanId) {
      router.push(`/fitness/diet-plans/${savedPlanId}`);
    } else {
      router.push("/fitness/diet-plans");
    }
  };

  if (loadingInitial) {
    return <LoadingState label="Loading diet plan builder…" />;
  }

  if (initialError) {
    return <ErrorState description={initialError} onRetry={() => router.refresh()} />;
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={mode === "edit" ? "Edit diet plan" : "Create diet plan"}
        description="Design personalized nutrition targets and daily meal schedules for your members."
        icon={Salad}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              onClick={() => router.push("/fitness/diet-plans")}
            >
              Cancel
            </Button>
            {currentStep === 4 ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => void handleSubmitPlan("draft")}
                  isLoading={saving}
                >
                  <FileText className="mr-1.5 size-4" />
                  Save as Draft
                </Button>
                <Button
                  onClick={() => void handleSubmitPlan("active")}
                  isLoading={saving}
                  className="bg-[#0E8F8B] hover:bg-[#063C3B]"
                >
                  <Send className="mr-1.5 size-4" />
                  Assign & Publish
                </Button>
              </>
            ) : (
              <Button
                onClick={goToNextStep}
                className="bg-[#0E8F8B] hover:bg-[#063C3B]"
              >
                Continue
                <ChevronRight className="ml-1 size-4" />
              </Button>
            )}
          </div>
        }
      />

      {/* Notice for Active or Completed Plans */}
      {originalStatus && originalStatus !== "draft" && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 shadow-xs">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 size-5 shrink-0 text-amber-600" />
            <div>
              <p className="font-semibold text-sm">
                Creating New Draft from {originalStatus === "active" ? "Active" : "Completed"} Plan
              </p>
              <p className="mt-0.5 text-xs text-amber-700 leading-relaxed">
                Active and completed plans cannot be directly modified to preserve member routines and history. Your changes will be saved as a new Draft version. The current active plan remains active until this draft is published.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Wizard Progress Steps */}
      <div className="rounded-xl border border-neutral-200 bg-white p-3 shadow-xs">
        <nav aria-label="Progress">
          <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {[
              { num: 1, title: "Plan details", desc: "Member & dates" },
              { num: 2, title: "Nutrition goals", desc: "Calories & macros" },
              { num: 3, title: "Meal schedule", desc: "Meals & foods" },
              { num: 4, title: "Preview & publish", desc: "Review & finalize" },
            ].map((step) => {
              const isCurrent = currentStep === step.num;
              const isDone = currentStep > step.num;

              return (
                <li
                  key={step.num}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg p-2.5 transition-colors ${
                    isCurrent
                      ? "bg-primary-50 text-primary-900 border border-primary-200"
                      : isDone
                        ? "text-ink hover:bg-neutral-50"
                        : "text-neutral-400"
                  }`}
                  onClick={() => {
                    if (isDone || isCurrent) {
                      setCurrentStep(step.num as 1 | 2 | 3 | 4);
                    }
                  }}
                >
                  <span
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                      isCurrent
                        ? "bg-[#0E8F8B] text-white"
                        : isDone
                          ? "bg-teal-100 text-[#063C3B]"
                          : "border border-neutral-300 bg-white text-neutral-500"
                    }`}
                  >
                    {isDone ? <Check className="size-4" /> : step.num}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold">{step.title}</p>
                    <p className="hidden truncate text-[11px] text-neutral-500 sm:block">
                      {step.desc}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {/* STEP 1: PLAN DETAILS */}
      {currentStep === 1 && (
        <Card className="space-y-6">
          <div className="border-b border-border pb-4">
            <h2 className="text-base font-semibold text-ink">Plan information</h2>
            <p className="text-xs text-neutral-500">
              Basic identification, goal, assigned member, and plan validity.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="Plan name" required>
              <Input
                value={planName}
                onChange={(e) => setPlanName(e.target.value)}
                placeholder="e.g. 12-Week Lean Muscle Nutrition"
              />
            </FormField>

            <FormField label="Goal / Category">
              <Select
                value={goal}
                onChange={(e) => setGoal(e.target.value as DietPlanGoal)}
                options={DIET_PLAN_GOALS.map((g) => ({ value: g, label: g }))}
              />
            </FormField>

            <FormField label="Assigned member" required>
              <Select
                value={memberId}
                onChange={(e) => setMemberId(e.target.value)}
                options={[
                  { value: "", label: "Select assigned member" },
                  ...memberOptions.map((m) => ({
                    value: m.value,
                    label: m.label,
                  })),
                ]}
              />
              {isTrainer && memberOptions.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  You do not have any currently assigned active members. An owner/admin can assign members to you.
                </p>
              )}
            </FormField>

            <FormField label="Trainer (from session)">
              <div className="flex h-10 items-center rounded-lg border border-border bg-neutral-50 px-3 text-sm text-neutral-700">
                <User className="mr-2 size-4 text-neutral-400" />
                <span className="font-medium">{trainerName}</span>
                <span className="ml-auto text-xs text-neutral-400">Authenticated</span>
              </div>
            </FormField>

            <FormField label="Start date">
              <Input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </FormField>

            <FormField label="End date">
              <Input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </FormField>

            <div className="sm:col-span-2">
              <FormField label="Notes & Special Instructions for Member">
                <Textarea
                  rows={3}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="e.g. Drink plenty of water throughout the day. Avoid sugar and late night carbs."
                />
              </FormField>
            </div>
          </div>

          <div className="flex justify-end pt-4">
            <Button onClick={goToNextStep} className="bg-[#0E8F8B] hover:bg-[#063C3B]">
              Continue to Nutrition Goals
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </Card>
      )}

      {/* STEP 2: NUTRITION GOALS */}
      {currentStep === 2 && (
        <div className="space-y-6">
          <Card className="space-y-6">
            <div className="border-b border-border pb-4">
              <h2 className="text-base font-semibold text-ink">Daily nutrition targets</h2>
              <p className="text-xs text-neutral-500">
                Specify target daily caloric intake, macronutrient distribution, and hydration.
              </p>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <FormField label="Daily Calories (kcal)">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={10}
                    value={targetCalories}
                    onChange={(e) => setTargetCalories(e.target.value)}
                    placeholder="e.g. 2200"
                    className="pr-12"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                    kcal
                  </span>
                </div>
              </FormField>

              <FormField label="Protein Target (g)">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={targetProtein}
                    onChange={(e) => setTargetProtein(e.target.value)}
                    placeholder="e.g. 150"
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                    g
                  </span>
                </div>
              </FormField>

              <FormField label="Carbs Target (g)">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={targetCarbs}
                    onChange={(e) => setTargetCarbs(e.target.value)}
                    placeholder="e.g. 200"
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                    g
                  </span>
                </div>
              </FormField>

              <FormField label="Fat Target (g)">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    step={1}
                    value={targetFat}
                    onChange={(e) => setTargetFat(e.target.value)}
                    placeholder="e.g. 60"
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                    g
                  </span>
                </div>
              </FormField>

              <FormField label="Water Intake Target (Litres)">
                <div className="relative">
                  <Input
                    type="number"
                    min={0}
                    max={15}
                    step={0.5}
                    value={targetWater}
                    onChange={(e) => setTargetWater(e.target.value)}
                    placeholder="e.g. 3.5"
                    className="pr-8"
                  />
                  <span className="pointer-events-none absolute right-3 top-2.5 text-xs text-neutral-400">
                    L
                  </span>
                </div>
              </FormField>
            </div>

            {/* Target Macro Breakdown Card */}
            {targetMacroCalories > 0 && (
              <div className="rounded-xl border border-teal-100 bg-teal-50/60 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="size-4 text-[#0E8F8B]" />
                    <span className="text-xs font-semibold text-[#063C3B]">
                      Macro Energy Distribution
                    </span>
                  </div>
                  <span className="text-xs font-medium text-neutral-600">
                    Total Macro Energy: <span className="font-semibold text-ink">{targetMacroCalories} kcal</span>
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div className="rounded-lg bg-white p-2 border border-teal-100 shadow-2xs">
                    <span className="text-[11px] font-medium text-neutral-500">Protein (4 kcal/g)</span>
                    <p className="text-sm font-bold text-teal-700">
                      {Math.round((((parsedTargetProtein ?? 0) * 4) / targetMacroCalories) * 100)}%
                    </p>
                    <span className="text-[11px] text-neutral-400">{(parsedTargetProtein ?? 0) * 4} kcal</span>
                  </div>

                  <div className="rounded-lg bg-white p-2 border border-teal-100 shadow-2xs">
                    <span className="text-[11px] font-medium text-neutral-500">Carbs (4 kcal/g)</span>
                    <p className="text-sm font-bold text-amber-600">
                      {Math.round((((parsedTargetCarbs ?? 0) * 4) / targetMacroCalories) * 100)}%
                    </p>
                    <span className="text-[11px] text-neutral-400">{(parsedTargetCarbs ?? 0) * 4} kcal</span>
                  </div>

                  <div className="rounded-lg bg-white p-2 border border-teal-100 shadow-2xs">
                    <span className="text-[11px] font-medium text-neutral-500">Fat (9 kcal/g)</span>
                    <p className="text-sm font-bold text-rose-600">
                      {Math.round((((parsedTargetFat ?? 0) * 9) / targetMacroCalories) * 100)}%
                    </p>
                    <span className="text-[11px] text-neutral-400">{(parsedTargetFat ?? 0) * 9} kcal</span>
                  </div>
                </div>
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goToPrevStep}>
              <ChevronLeft className="mr-1 size-4" />
              Back
            </Button>
            <Button onClick={goToNextStep} className="bg-[#0E8F8B] hover:bg-[#063C3B]">
              Continue to Meal Schedule
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 3: MEAL SCHEDULE BUILDER */}
      {currentStep === 3 && (
        <div className="space-y-6">
          {/* Quick Add Meal Toolbar */}
          <div className="rounded-xl border border-neutral-200 bg-neutral-50/70 p-4">
            <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-semibold text-ink">Add a meal to the schedule</h3>
                <p className="text-xs text-neutral-500">
                  Select a standard meal time or create a custom meal.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {STANDARD_MEALS.map((meal) => (
                  <Button
                    key={meal.value}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="bg-white hover:bg-teal-50 hover:text-[#0E8F8B] hover:border-teal-300 text-xs"
                    onClick={() => handleAddMeal(meal.value)}
                  >
                    <Plus className="mr-1 size-3" />
                    {meal.value}
                  </Button>
                ))}
              </div>
            </div>
          </div>

          {/* Meals List */}
          {mealNames.length === 0 ? (
            <Card className="py-12 text-center">
              <Salad className="mx-auto size-10 text-neutral-300" />
              <h3 className="mt-3 text-sm font-semibold text-ink">No meals added yet</h3>
              <p className="mt-1 text-xs text-neutral-500">
                Click one of the meal buttons above to begin structuring your diet plan.
              </p>
            </Card>
          ) : (
            <div className="space-y-6">
              {mealNames.map((mealName, mealIdx) => {
                const mealItems = items.filter((i) => i.meal === mealName);
                const mealSummary = calculateNutritionSummary(mealItems);
                const firstItem = mealItems[0];

                return (
                  <Card key={mealName} className="space-y-4 border-l-4 border-l-[#0E8F8B]">
                    {/* Meal Header */}
                    <div className="flex flex-col gap-3 border-b border-border pb-3 sm:flex-row sm:items-center sm:justify-between">
                      <div className="flex flex-wrap items-center gap-3">
                        <span className="flex size-6 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-[#063C3B]">
                          {mealIdx + 1}
                        </span>
                        <Input
                          value={mealName}
                          onChange={(e) => handleRenameMeal(mealName, e.target.value)}
                          className="h-8 w-44 font-semibold text-ink"
                        />
                        <div className="flex items-center gap-1.5 text-xs text-neutral-500">
                          <Clock className="size-3.5 text-neutral-400" />
                          <Input
                            type="time"
                            value={firstItem?.mealTime || ""}
                            onChange={(e) => handleSetMealTime(mealName, e.target.value)}
                            className="h-8 w-28 text-xs"
                          />
                        </div>
                      </div>

                      {/* Meal Subtotal Pills & Remove Action */}
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="rounded-md bg-neutral-100 px-2 py-1 text-xs font-medium text-neutral-700">
                          🔥 {mealSummary.totalCalories} kcal
                        </span>
                        <span className="rounded-md bg-teal-50 px-2 py-1 text-xs font-medium text-teal-700">
                          P: {mealSummary.totalProtein}g
                        </span>
                        <span className="rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                          C: {mealSummary.totalCarbs}g
                        </span>
                        <span className="rounded-md bg-rose-50 px-2 py-1 text-xs font-medium text-rose-700">
                          F: {mealSummary.totalFat}g
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRemoveMeal(mealName)}
                          className="text-neutral-400 hover:text-rose-600"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </div>

                    {/* Meal Specific Instructions */}
                    <div className="grid gap-2">
                      <Input
                        value={firstItem?.instructions || ""}
                        onChange={(e) => handleSetMealInstructions(mealName, e.target.value)}
                        placeholder="Optional meal notes (e.g. Take 15 mins before workout, drink with warm water)"
                        className="text-xs text-neutral-600 bg-neutral-50/50"
                      />
                    </div>

                    {/* Food Items in this Meal */}
                    <div className="space-y-2">
                      <div className="hidden grid-cols-12 gap-2 text-[11px] font-semibold text-neutral-500 sm:grid px-2">
                        <span className="col-span-4">Food item</span>
                        <span className="col-span-2">Quantity & unit</span>
                        <span className="col-span-2">Calories (kcal)</span>
                        <span className="col-span-3">Macros (P / C / F)</span>
                        <span className="col-span-1 text-right">Actions</span>
                      </div>

                      {items.map((item, globalIdx) => {
                        if (item.meal !== mealName) return null;

                        return (
                          <div
                            key={globalIdx}
                            className="rounded-lg border border-neutral-100 bg-neutral-50/40 p-2.5 sm:grid sm:grid-cols-12 sm:items-center sm:gap-2"
                          >
                            {/* Food name */}
                            <div className="col-span-4">
                              <Input
                                value={item.foodName}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, { foodName: e.target.value })
                                }
                                placeholder="e.g. Rolled oats, Boiled eggs"
                                className="h-8 text-xs font-medium"
                              />
                            </div>

                            {/* Quantity & Unit */}
                            <div className="mt-2 flex items-center gap-1 sm:col-span-2 sm:mt-0">
                              <Input
                                type="number"
                                min={0}
                                step={1}
                                value={item.quantity != null ? item.quantity : ""}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, {
                                    quantity: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Qty"
                                className="h-8 w-16 text-xs"
                              />
                              <Select
                                value={item.unit || "g"}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, { unit: e.target.value })
                                }
                                options={COMMON_UNITS.map((u) => ({ value: u, label: u }))}
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* Calories */}
                            <div className="mt-2 sm:col-span-2 sm:mt-0">
                              <Input
                                type="number"
                                min={0}
                                step={5}
                                value={item.calories != null ? item.calories : ""}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, {
                                    calories: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Calories"
                                className="h-8 text-xs"
                              />
                            </div>

                            {/* Macros */}
                            <div className="mt-2 flex items-center gap-1 sm:col-span-3 sm:mt-0">
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={item.proteinG != null ? item.proteinG : ""}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, {
                                    proteinG: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Prot (g)"
                                className="h-8 text-xs"
                                title="Protein in grams"
                              />
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={item.carbsG != null ? item.carbsG : ""}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, {
                                    carbsG: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Carb (g)"
                                className="h-8 text-xs"
                                title="Carbohydrates in grams"
                              />
                              <Input
                                type="number"
                                min={0}
                                step={0.5}
                                value={item.fatG != null ? item.fatG : ""}
                                onChange={(e) =>
                                  handleUpdateItem(globalIdx, {
                                    fatG: e.target.value ? Number(e.target.value) : null,
                                  })
                                }
                                placeholder="Fat (g)"
                                className="h-8 text-xs"
                                title="Fat in grams"
                              />
                            </div>

                            {/* Actions */}
                            <div className="mt-2 flex items-center justify-end gap-1 sm:col-span-1 sm:mt-0">
                              <button
                                type="button"
                                onClick={() => handleMoveItem(globalIdx, "up")}
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-ink"
                                title="Move up"
                              >
                                <ArrowUp className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveItem(globalIdx, "down")}
                                className="rounded p-1 text-neutral-400 hover:bg-neutral-200 hover:text-ink"
                                title="Move down"
                              >
                                <ArrowDown className="size-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleRemoveItem(globalIdx)}
                                className="rounded p-1 text-neutral-400 hover:bg-rose-100 hover:text-rose-600"
                                title="Remove item"
                              >
                                <Trash2 className="size-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-1">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => handleAddFoodItem(mealName)}
                        className="text-xs"
                      >
                        <Plus className="mr-1 size-3" />
                        Add Food Item to {mealName}
                      </Button>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {/* Daily Schedule Summary & Target Comparison */}
          <Card className="border-teal-200 bg-gradient-to-br from-teal-50/70 via-white to-teal-50/30">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h3 className="text-sm font-bold text-ink">Daily Schedule Summary</h3>
                <p className="text-xs text-neutral-500">
                  Calculated from all scheduled meals and food items.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-lg bg-white p-2.5 border border-teal-100 text-center shadow-2xs">
                  <span className="text-[11px] font-medium text-neutral-500">Total Calories</span>
                  <p className="text-base font-bold text-ink">{nutritionSummary.totalCalories} kcal</p>
                  {parsedTargetCalories && (
                    <span className="text-[10px] text-neutral-500">
                      Target: {parsedTargetCalories} kcal
                    </span>
                  )}
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-teal-100 text-center shadow-2xs">
                  <span className="text-[11px] font-medium text-neutral-500">Total Protein</span>
                  <p className="text-base font-bold text-teal-700">{nutritionSummary.totalProtein}g</p>
                  {parsedTargetProtein && (
                    <span className="text-[10px] text-neutral-500">
                      Target: {parsedTargetProtein}g
                    </span>
                  )}
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-teal-100 text-center shadow-2xs">
                  <span className="text-[11px] font-medium text-neutral-500">Total Carbs</span>
                  <p className="text-base font-bold text-amber-600">{nutritionSummary.totalCarbs}g</p>
                  {parsedTargetCarbs && (
                    <span className="text-[10px] text-neutral-500">
                      Target: {parsedTargetCarbs}g
                    </span>
                  )}
                </div>

                <div className="rounded-lg bg-white p-2.5 border border-teal-100 text-center shadow-2xs">
                  <span className="text-[11px] font-medium text-neutral-500">Total Fat</span>
                  <p className="text-base font-bold text-rose-600">{nutritionSummary.totalFat}g</p>
                  {parsedTargetFat && (
                    <span className="text-[10px] text-neutral-500">
                      Target: {parsedTargetFat}g
                    </span>
                  )}
                </div>
              </div>
            </div>

            {(nutritionSummary.hasMissingCalories || nutritionSummary.hasMissingMacros) && (
              <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 border border-amber-200">
                <AlertCircle className="size-4 shrink-0 text-amber-600" />
                <span>
                  Some food items have missing calories or macro values. Missing values are excluded from totals rather than assumed zero.
                </span>
              </div>
            )}
          </Card>

          <div className="flex items-center justify-between">
            <Button variant="outline" onClick={goToPrevStep}>
              <ChevronLeft className="mr-1 size-4" />
              Back
            </Button>
            <Button onClick={goToNextStep} className="bg-[#0E8F8B] hover:bg-[#063C3B]">
              Continue to Preview & Publish
              <ChevronRight className="ml-1 size-4" />
            </Button>
          </div>
        </div>
      )}

      {/* STEP 4: PREVIEW & PUBLISH */}
      {currentStep === 4 && (
        <div className="space-y-6">
          <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2.5">
                <Eye className="size-5 text-[#0E8F8B]" />
                <div>
                  <h3 className="text-sm font-bold text-ink">Member-facing diet plan preview</h3>
                  <p className="text-xs text-neutral-500">
                    Review exactly how your member will view their assigned diet plan in the Member Portal.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setCurrentStep(3)}>
                  Back to edit schedule
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void handleSubmitPlan("draft")}
                  isLoading={saving}
                >
                  <FileText className="mr-1.5 size-4" />
                  Save as Draft
                </Button>
                <Button
                  size="sm"
                  onClick={() => void handleSubmitPlan("active")}
                  isLoading={saving}
                  className="bg-[#0E8F8B] hover:bg-[#063C3B]"
                >
                  <Send className="mr-1.5 size-4" />
                  Assign & Publish
                </Button>
              </div>
            </div>
          </div>

          {/* Member Portal Style Preview Card */}
          <div className="overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-md">
            {/* Header Banner */}
            <div className="bg-gradient-to-r from-[#063C3B] to-[#0E8F8B] p-6 text-white">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Badge className="bg-white/20 text-white hover:bg-white/30 backdrop-blur-xs">
                      {goal}
                    </Badge>
                    <span className="text-xs text-teal-100">
                      Validity: {formatDate(startDate)} {endDate ? `— ${formatDate(endDate)}` : ""}
                    </span>
                  </div>
                  <h1 className="text-xl font-bold tracking-tight text-white sm:text-2xl">
                    {planName}
                  </h1>
                  <p className="text-xs text-teal-100">
                    Assigned to: <span className="font-semibold text-white">{selectedMember?.label}</span> ·
                    Prepared by: <span className="font-semibold text-white">{trainerName}</span>
                  </p>
                </div>

                <div className="rounded-xl bg-white/10 p-3 text-right backdrop-blur-sm border border-white/10">
                  <span className="text-[11px] text-teal-100">Daily Target</span>
                  <p className="text-2xl font-bold text-white">
                    {targetCalories ? `${targetCalories} kcal` : `${nutritionSummary.totalCalories} kcal`}
                  </p>
                  <span className="text-[11px] text-teal-200">
                    💧 {targetWater || "3.0"} Litres water/day
                  </span>
                </div>
              </div>
            </div>

            <div className="p-6 space-y-6">
              {/* Daily Macro Targets Card */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <div className="rounded-xl border border-neutral-200 bg-neutral-50/60 p-3 text-center">
                  <span className="text-xs font-medium text-neutral-500">Planned Calories</span>
                  <p className="mt-1 text-lg font-bold text-ink">{nutritionSummary.totalCalories} kcal</p>
                  <span className="text-[11px] text-neutral-400">
                    Target: {targetCalories || "—"} kcal
                  </span>
                </div>

                <div className="rounded-xl border border-teal-100 bg-teal-50/50 p-3 text-center">
                  <span className="text-xs font-medium text-teal-700">Planned Protein</span>
                  <p className="mt-1 text-lg font-bold text-teal-800">{nutritionSummary.totalProtein}g</p>
                  <span className="text-[11px] text-teal-600">
                    Target: {targetProtein ? `${targetProtein}g` : "—"}
                  </span>
                </div>

                <div className="rounded-xl border border-amber-100 bg-amber-50/50 p-3 text-center">
                  <span className="text-xs font-medium text-amber-700">Planned Carbs</span>
                  <p className="mt-1 text-lg font-bold text-amber-800">{nutritionSummary.totalCarbs}g</p>
                  <span className="text-[11px] text-amber-600">
                    Target: {targetCarbs ? `${targetCarbs}g` : "—"}
                  </span>
                </div>

                <div className="rounded-xl border border-rose-100 bg-rose-50/50 p-3 text-center">
                  <span className="text-xs font-medium text-rose-700">Planned Fat</span>
                  <p className="mt-1 text-lg font-bold text-rose-800">{nutritionSummary.totalFat}g</p>
                  <span className="text-[11px] text-rose-600">
                    Target: {targetFat ? `${targetFat}g` : "—"}
                  </span>
                </div>
              </div>

              {/* Special Instructions Alert */}
              {notes && (
                <div className="rounded-xl border border-teal-200 bg-teal-50/40 p-4">
                  <h4 className="text-xs font-bold text-[#063C3B] uppercase tracking-wider">
                    Trainer instructions & guidelines
                  </h4>
                  <p className="mt-1 text-sm text-neutral-700 whitespace-pre-line">{notes}</p>
                </div>
              )}

              {/* Chronological Meal Schedule */}
              <div className="space-y-4">
                <h3 className="text-base font-bold text-ink">Daily meal schedule</h3>

                <div className="space-y-4">
                  {mealNames.map((mealName, idx) => {
                    const mealItems = items.filter((i) => i.meal === mealName);
                    const mealSummary = calculateNutritionSummary(mealItems);
                    const firstItem = mealItems[0];

                    return (
                      <div
                        key={mealName}
                        className="rounded-xl border border-neutral-200 bg-white p-4 shadow-2xs"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-neutral-100 pb-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex size-6 items-center justify-center rounded-full bg-[#0E8F8B] text-xs font-bold text-white">
                              {idx + 1}
                            </span>
                            <h4 className="font-bold text-ink">{mealName}</h4>
                            {firstItem?.mealTime && (
                              <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-600 flex items-center gap-1">
                                <Clock className="size-3 text-neutral-400" />
                                {firstItem.mealTime}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs font-medium text-neutral-600">
                            <span>🔥 {mealSummary.totalCalories} kcal</span>
                            <span>•</span>
                            <span className="text-teal-700">P: {mealSummary.totalProtein}g</span>
                            <span>•</span>
                            <span className="text-amber-700">C: {mealSummary.totalCarbs}g</span>
                            <span>•</span>
                            <span className="text-rose-700">F: {mealSummary.totalFat}g</span>
                          </div>
                        </div>

                        {firstItem?.instructions && (
                          <p className="mt-2 text-xs italic text-neutral-500">
                            Tip: {firstItem.instructions}
                          </p>
                        )}

                        <div className="mt-3 divide-y divide-neutral-100">
                          {mealItems.map((item, itemIdx) => (
                            <div
                              key={itemIdx}
                              className="flex items-center justify-between py-2 text-sm"
                            >
                              <div className="flex items-center gap-2">
                                <span className="size-1.5 rounded-full bg-[#0E8F8B]" />
                                <span className="font-medium text-ink">{item.foodName}</span>
                                {item.quantity && (
                                  <span className="text-xs text-neutral-500">
                                    ({item.quantity} {item.unit || "g"})
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center gap-3 text-xs text-neutral-600">
                                <span>{item.calories != null ? `${item.calories} kcal` : "— kcal"}</span>
                                <span className="text-neutral-400">|</span>
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
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-4">
            <Button variant="outline" onClick={goToPrevStep}>
              <ChevronLeft className="mr-1 size-4" />
              Back to Meal Schedule
            </Button>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                onClick={() => void handleSubmitPlan("draft")}
                isLoading={saving}
              >
                <FileText className="mr-1.5 size-4" />
                Save as Draft
              </Button>
              <Button
                onClick={() => void handleSubmitPlan("active")}
                isLoading={saving}
                className="bg-[#0E8F8B] hover:bg-[#063C3B]"
              >
                <Send className="mr-1.5 size-4" />
                Assign & Publish Plan
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
