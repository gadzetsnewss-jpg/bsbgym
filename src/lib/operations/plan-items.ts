/**
 * Workout / diet plan item reads and writes.
 *
 * Reads use RLS-scoped selects. Writes go through SECURITY DEFINER RPCs.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import type { SelectOption } from "@/components/ui/select";

type AnyTable = "gym_members";
type AnyFunction = "create_gym_member";
type RpcError = { message?: string } | null;
type Row = Record<string, unknown>;

function clientOrNull() {
  return getSupabaseBrowserClient();
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function embedName(value: unknown): string | null {
  if (!value) return null;
  const record = (Array.isArray(value) ? value[0] : value) as { name?: string } | null;
  return record?.name ? String(record.name) : null;
}

async function callRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: RpcError }> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  return (supabase.rpc as unknown as (
    name: AnyFunction,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: RpcError }>)(fn as AnyFunction, args);
}

export interface WorkoutPlanItemRow {
  id: string;
  planId: string;
  exerciseId: string | null;
  exerciseName: string | null;
  dayLabel: string | null;
  sets: number | null;
  reps: string | null;
  weight: string | null;
  restSeconds: number | null;
  sortOrder: number;
  notes: string | null;
}

export interface DietPlanItemRow {
  id: string;
  dietPlanId: string;
  meal: string;
  description: string | null;
  calories: number | null;
  sortOrder: number;
}

export interface WorkoutPlanItemInput {
  exerciseId?: string | null;
  dayLabel?: string | null;
  sets?: number | null;
  reps?: string | null;
  weight?: string | null;
  restSeconds?: number | null;
  sortOrder?: number | null;
  notes?: string | null;
}

export interface DietPlanItemInput {
  meal: string;
  description?: string | null;
  calories?: number | null;
  sortOrder?: number | null;
}

export async function loadExerciseOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = clientOrNull();
  if (!supabase) return [];
  const { data } = await supabase
    .from("exercises" as AnyTable)
    .select("id, name, is_active")
    .eq("organization_id", organizationId)
    .order("name" as "created_at", { ascending: true })
    .limit(200);
  return ((data ?? []) as unknown as Row[])
    .filter((row) => row.is_active !== false)
    .map((row) => ({
      value: asString(row.id),
      label: asString(row.name) || "Exercise",
    }));
}

export async function fetchWorkoutPlanItems(
  organizationId: string,
  planId: string,
): Promise<OrgResult<WorkoutPlanItemRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("workout_plan_items" as AnyTable)
    .select(
      "id, plan_id, exercise_id, day_label, sets, reps, weight, rest_seconds, sort_order, notes, exercises(id, name)",
    )
    .eq("organization_id", organizationId)
    .eq("plan_id" as "id", planId)
    .order("sort_order" as "created_at", { ascending: true });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      planId: asString(row.plan_id),
      exerciseId: asNullableString(row.exercise_id),
      exerciseName: embedName(row.exercises),
      dayLabel: asNullableString(row.day_label),
      sets: asNullableNumber(row.sets),
      reps: asNullableString(row.reps),
      weight: asNullableString(row.weight),
      restSeconds: asNullableNumber(row.rest_seconds),
      sortOrder: asNullableNumber(row.sort_order) ?? 0,
      notes: asNullableString(row.notes),
    })),
    error: null,
  };
}

export async function fetchDietPlanItems(
  organizationId: string,
  dietPlanId: string,
): Promise<OrgResult<DietPlanItemRow[]>> {
  const supabase = clientOrNull();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const { data, error } = await supabase
    .from("diet_plan_items" as AnyTable)
    .select("id, diet_plan_id, meal, description, calories, sort_order")
    .eq("organization_id", organizationId)
    .eq("diet_plan_id" as "id", dietPlanId)
    .order("sort_order" as "created_at", { ascending: true });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => ({
      id: asString(row.id),
      dietPlanId: asString(row.diet_plan_id),
      meal: asString(row.meal) || "Meal",
      description: asNullableString(row.description),
      calories: asNullableNumber(row.calories),
      sortOrder: asNullableNumber(row.sort_order) ?? 0,
    })),
    error: null,
  };
}

export async function createWorkoutPlanItem(
  organizationId: string,
  planId: string,
  input: WorkoutPlanItemInput,
): Promise<OrgResult<{ id: string }>> {
  const { data, error } = await callRpc("create_workout_plan_item", {
    p_org_id: organizationId,
    p_plan_id: planId,
    p_exercise_id: input.exerciseId || null,
    p_day_label: input.dayLabel || null,
    p_sets: input.sets ?? null,
    p_reps: input.reps || null,
    p_weight: input.weight || null,
    p_rest_seconds: input.restSeconds ?? null,
    p_sort_order: input.sortOrder ?? null,
    p_notes: input.notes || null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

export async function updateWorkoutPlanItem(
  itemId: string,
  input: WorkoutPlanItemInput,
): Promise<OrgResult> {
  const { error } = await callRpc("update_workout_plan_item", {
    p_item_id: itemId,
    p_exercise_id: input.exerciseId || null,
    p_day_label: input.dayLabel || null,
    p_sets: input.sets ?? null,
    p_reps: input.reps || null,
    p_weight: input.weight || null,
    p_rest_seconds: input.restSeconds ?? null,
    p_sort_order: input.sortOrder ?? null,
    p_notes: input.notes || null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}

export async function createDietPlanItem(
  organizationId: string,
  dietPlanId: string,
  input: DietPlanItemInput,
): Promise<OrgResult<{ id: string }>> {
  const { data, error } = await callRpc("create_diet_plan_item", {
    p_org_id: organizationId,
    p_diet_plan_id: dietPlanId,
    p_meal: input.meal,
    p_description: input.description || null,
    p_calories: input.calories ?? null,
    p_sort_order: input.sortOrder ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: { id: String(data) }, error: null };
}

export async function updateDietPlanItem(
  itemId: string,
  input: DietPlanItemInput,
): Promise<OrgResult> {
  const { error } = await callRpc("update_diet_plan_item", {
    p_item_id: itemId,
    p_meal: input.meal,
    p_description: input.description || null,
    p_calories: input.calories ?? null,
    p_sort_order: input.sortOrder ?? null,
  });
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: undefined, error: null };
}
