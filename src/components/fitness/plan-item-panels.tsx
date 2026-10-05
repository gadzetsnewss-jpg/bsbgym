"use client";

import * as React from "react";
import { Dumbbell, Salad } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/ui/loading-state";
import { Select, type SelectOption } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import {
  createDietPlanItem,
  createWorkoutPlanItem,
  fetchDietPlanItems,
  fetchWorkoutPlanItems,
  loadExerciseOptions,
  type DietPlanItemRow,
  type WorkoutPlanItemRow,
} from "@/lib/operations/plan-items";
import type { DietPlanRow, WorkoutPlanRow } from "@/lib/operations/adapters";

function numberOrNull(value: string): number | null {
  const trimmed = value.trim();
  if (trimmed === "") return null;
  const parsed = Number(trimmed);
  return Number.isNaN(parsed) ? null : parsed;
}

export function workoutPlanDetailExtras(row: WorkoutPlanRow) {
  return <WorkoutPlanItemsPanel planId={row.id} />;
}

export function dietPlanDetailExtras(row: DietPlanRow) {
  return <DietPlanItemsPanel planId={row.id} />;
}

function WorkoutPlanItemsPanel({ planId }: { planId: string }) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("fitness.view");
  const canManage = can("fitness.manage");

  const [rows, setRows] = React.useState<WorkoutPlanItemRow[]>([]);
  const [exercises, setExercises] = React.useState<SelectOption[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [exerciseId, setExerciseId] = React.useState("");
  const [dayLabel, setDayLabel] = React.useState("");
  const [sets, setSets] = React.useState("");
  const [reps, setReps] = React.useState("");
  const [weight, setWeight] = React.useState("");
  const [restSeconds, setRestSeconds] = React.useState("");
  const [notes, setNotes] = React.useState("");

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [itemResult, exerciseResult] = await Promise.all([
      fetchWorkoutPlanItems(orgId, planId),
      loadExerciseOptions(orgId),
    ]);
    setLoading(false);
    if (itemResult.error) {
      setError(itemResult.error.message);
      return;
    }
    setRows(itemResult.data);
    setExercises(exerciseResult);
  }, [orgId, planId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    setSaving(true);
    const result = await createWorkoutPlanItem(orgId, planId, {
      exerciseId: exerciseId || null,
      dayLabel: dayLabel || null,
      sets: numberOrNull(sets),
      reps: reps || null,
      weight: weight || null,
      restSeconds: numberOrNull(restSeconds),
      notes: notes || null,
    });
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not add exercise", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Exercise added", variant: "success" });
    setExerciseId("");
    setDayLabel("");
    setSets("");
    setReps("");
    setWeight("");
    setRestSeconds("");
    setNotes("");
    void load();
  };

  if (!canView) return null;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading exercises…" />;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Exercises</h2>
        <p className="mt-0.5 text-sm text-neutral-500">
          Exercises assigned to this workout plan.
        </p>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Dumbbell}
          title="No exercises yet"
          description="Add an exercise from the catalog to this plan."
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">{row.exerciseName ?? "Custom exercise"}</p>
                <p className="text-xs text-neutral-500">
                  {[
                    row.dayLabel,
                    row.sets != null ? `${row.sets} sets` : null,
                    row.reps ? `${row.reps} reps` : null,
                    row.weight,
                    row.restSeconds != null ? `${row.restSeconds}s rest` : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || "No details"}
                  {row.notes ? ` · ${row.notes}` : ""}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {canManage && (
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <FormField label="Exercise">
            <Select
              options={exercises}
              placeholder="Select an exercise"
              value={exerciseId}
              onChange={(event) => setExerciseId(event.target.value)}
            />
          </FormField>
          <FormField label="Day">
            <Input value={dayLabel} onChange={(event) => setDayLabel(event.target.value)} placeholder="e.g. Day 1" />
          </FormField>
          <FormField label="Sets">
            <Input type="number" min={0} step={1} value={sets} onChange={(event) => setSets(event.target.value)} />
          </FormField>
          <FormField label="Reps">
            <Input value={reps} onChange={(event) => setReps(event.target.value)} placeholder="e.g. 8-12" />
          </FormField>
          <FormField label="Weight">
            <Input value={weight} onChange={(event) => setWeight(event.target.value)} placeholder="e.g. 20 kg" />
          </FormField>
          <FormField label="Rest (seconds)">
            <Input
              type="number"
              min={0}
              step={1}
              value={restSeconds}
              onChange={(event) => setRestSeconds(event.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Notes">
              <Textarea rows={2} value={notes} onChange={(event) => setNotes(event.target.value)} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" isLoading={saving}>
              Add exercise
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}

function DietPlanItemsPanel({ planId }: { planId: string }) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("fitness.view");
  const canManage = can("fitness.manage");

  const [rows, setRows] = React.useState<DietPlanItemRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [saving, setSaving] = React.useState(false);
  const [meal, setMeal] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [calories, setCalories] = React.useState("");

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchDietPlanItems(orgId, planId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, planId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId) return;
    const mealName = meal.trim();
    if (!mealName) {
      toast({ title: "Meal is required", variant: "error" });
      return;
    }
    setSaving(true);
    const result = await createDietPlanItem(orgId, planId, {
      meal: mealName,
      description: description || null,
      calories: numberOrNull(calories),
    });
    setSaving(false);
    if (result.error) {
      toast({ title: "Could not add meal", description: result.error.message, variant: "error" });
      return;
    }
    toast({ title: "Meal added", variant: "success" });
    setMeal("");
    setDescription("");
    setCalories("");
    void load();
  };

  if (!canView) return null;
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading meals…" />;

  return (
    <Card className="space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-ink">Meals</h2>
        <p className="mt-0.5 text-sm text-neutral-500">Meals assigned to this diet plan.</p>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={Salad}
          title="No meals yet"
          description="Add a meal to this diet plan."
        />
      ) : (
        <ol className="space-y-3">
          {rows.map((row) => (
            <li
              key={row.id}
              className="flex items-start justify-between gap-4 border-b border-border pb-3 last:border-0 last:pb-0"
            >
              <div>
                <p className="text-sm font-medium text-ink">{row.meal}</p>
                <p className="text-xs text-neutral-500">
                  {[row.description, row.calories != null ? `${row.calories} kcal` : null]
                    .filter(Boolean)
                    .join(" · ") || "No details"}
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
      {canManage && (
        <form onSubmit={(event) => void submit(event)} className="grid gap-4 border-t border-border pt-4 sm:grid-cols-2">
          <FormField label="Meal" required>
            <Input value={meal} onChange={(event) => setMeal(event.target.value)} placeholder="e.g. Breakfast" />
          </FormField>
          <FormField label="Calories">
            <Input
              type="number"
              min={0}
              step={1}
              value={calories}
              onChange={(event) => setCalories(event.target.value)}
            />
          </FormField>
          <div className="sm:col-span-2">
            <FormField label="Description">
              <Textarea rows={2} value={description} onChange={(event) => setDescription(event.target.value)} />
            </FormField>
          </div>
          <div className="sm:col-span-2">
            <Button type="submit" size="sm" isLoading={saving}>
              Add meal
            </Button>
          </div>
        </form>
      )}
    </Card>
  );
}
