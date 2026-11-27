import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";

type AnyFunction = "create_gym_member";

async function callRpc(
  fn: string,
  args: Record<string, unknown>,
): Promise<{ data: unknown; error: { message?: string } | null }> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };
  return (supabase.rpc as unknown as (
    name: AnyFunction,
    params: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message?: string } | null }>)(fn as AnyFunction, args);
}

export type DietPlanGoal =
  | "Fat Loss"
  | "Muscle Gain"
  | "Weight Maintenance"
  | "General Fitness"
  | "Custom";

export type DietPlanStatus = "draft" | "active" | "completed";

export const DIET_PLAN_GOALS: readonly DietPlanGoal[] = [
  "Fat Loss",
  "Muscle Gain",
  "Weight Maintenance",
  "General Fitness",
  "Custom",
] as const;

export const STANDARD_MEALS = [
  { value: "Early Morning", defaultTime: "06:30" },
  { value: "Breakfast", defaultTime: "08:30" },
  { value: "Mid-Morning", defaultTime: "11:00" },
  { value: "Lunch", defaultTime: "13:30" },
  { value: "Evening Snack", defaultTime: "17:00" },
  { value: "Pre-Workout", defaultTime: "18:00" },
  { value: "Post-Workout", defaultTime: "19:30" },
  { value: "Dinner", defaultTime: "21:00" },
  { value: "Other / Custom", defaultTime: "12:00" },
] as const;

export const COMMON_UNITS = [
  "g",
  "ml",
  "piece",
  "cup",
  "bowl",
  "tbsp",
  "tsp",
  "slice",
  "scoop",
  "serving",
] as const;

export interface DietFoodItem {
  id?: string;
  meal: string;
  mealTime?: string | null;
  foodName: string;
  quantity?: number | null;
  unit?: string | null;
  calories?: number | null;
  proteinG?: number | null;
  carbsG?: number | null;
  fatG?: number | null;
  instructions?: string | null;
  sortOrder: number;
}

export interface MealGroup {
  id: string;
  meal: string;
  mealTime: string;
  instructions: string;
  items: DietFoodItem[];
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasMissingCalories: boolean;
  hasMissingMacros: boolean;
}

export interface DietPlanRecord {
  id: string;
  organizationId: string;
  memberId: string;
  memberName?: string;
  memberCode?: string;
  memberPhone?: string;
  trainerId: string | null;
  trainerName?: string | null;
  name: string;
  goal?: DietPlanGoal | null;
  status: DietPlanStatus;
  dailyCalorieTarget?: number | null;
  proteinTargetG?: number | null;
  carbTargetG?: number | null;
  fatTargetG?: number | null;
  waterIntakeLiters?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  notes?: string | null;
  isActive: boolean;
  items: DietFoodItem[];
  createdAt: string;
  updatedAt: string;
}

export interface NutritionSummary {
  totalCalories: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  hasMissingCalories: boolean;
  hasMissingMacros: boolean;
  macroCalories: number;
  proteinPct: number;
  carbsPct: number;
  fatPct: number;
}

/**
 * Calculates live nutrition totals accurately from food items.
 * Missing numbers are flagged rather than silently treated as complete zero.
 */
export function calculateNutritionSummary(items: DietFoodItem[]): NutritionSummary {
  let totalCalories = 0;
  let totalProtein = 0;
  let totalCarbs = 0;
  let totalFat = 0;
  let hasMissingCalories = false;
  let hasMissingMacros = false;

  for (const item of items) {
    if (item.calories == null) {
      hasMissingCalories = true;
    } else {
      totalCalories += Number(item.calories);
    }

    if (item.proteinG == null || item.carbsG == null || item.fatG == null) {
      hasMissingMacros = true;
    }

    if (item.proteinG != null) totalProtein += Number(item.proteinG);
    if (item.carbsG != null) totalCarbs += Number(item.carbsG);
    if (item.fatG != null) totalFat += Number(item.fatG);
  }

  // Round macros to 1 decimal place to prevent floating point drift
  totalProtein = Math.round(totalProtein * 10) / 10;
  totalCarbs = Math.round(totalCarbs * 10) / 10;
  totalFat = Math.round(totalFat * 10) / 10;
  totalCalories = Math.round(totalCalories);

  const macroCalories = Math.round(totalProtein * 4 + totalCarbs * 4 + totalFat * 9);
  const proteinPct = macroCalories > 0 ? Math.round(((totalProtein * 4) / macroCalories) * 100) : 0;
  const carbsPct = macroCalories > 0 ? Math.round(((totalCarbs * 4) / macroCalories) * 100) : 0;
  const fatPct = macroCalories > 0 ? Math.round(((totalFat * 9) / macroCalories) * 100) : 0;

  return {
    totalCalories,
    totalProtein,
    totalCarbs,
    totalFat,
    hasMissingCalories,
    hasMissingMacros,
    macroCalories,
    proteinPct,
    carbsPct,
    fatPct,
  };
}

/**
 * Groups food items into chronological meals preserving order.
 */
export function groupItemsByMeal(items: DietFoodItem[]): MealGroup[] {
  const groups: MealGroup[] = [];
  const mealMap = new Map<string, MealGroup>();

  // Sort items primarily by sortOrder
  const sorted = [...items].sort((a, b) => a.sortOrder - b.sortOrder);

  for (const item of sorted) {
    const mealKey = item.meal || "Meal";
    let group = mealMap.get(mealKey);
    if (!group) {
      group = {
        id: `meal-${groups.length + 1}-${mealKey}`,
        meal: mealKey,
        mealTime: item.mealTime || "",
        instructions: item.instructions || "",
        items: [],
        totalCalories: 0,
        totalProtein: 0,
        totalCarbs: 0,
        totalFat: 0,
        hasMissingCalories: false,
        hasMissingMacros: false,
      };
      mealMap.set(mealKey, group);
      groups.push(group);
    }

    if (!group.mealTime && item.mealTime) {
      group.mealTime = item.mealTime;
    }
    if (!group.instructions && item.instructions) {
      group.instructions = item.instructions;
    }

    group.items.push(item);
  }

  // Calculate totals per meal group
  for (const group of groups) {
    const summary = calculateNutritionSummary(group.items);
    group.totalCalories = summary.totalCalories;
    group.totalProtein = summary.totalProtein;
    group.totalCarbs = summary.totalCarbs;
    group.totalFat = summary.totalFat;
    group.hasMissingCalories = summary.hasMissingCalories;
    group.hasMissingMacros = summary.hasMissingMacros;
  }

  return groups;
}

function embedName(record: unknown): string | null {
  if (!record || typeof record !== "object") return null;
  const r = record as { full_name?: string | null; first_name?: string | null; last_name?: string | null };
  if (r.full_name) return r.full_name;
  const name = [r.first_name, r.last_name].filter(Boolean).join(" ").trim();
  return name || null;
}

// Data Fetching

export async function fetchDietPlanById(
  organizationId: string,
  planId: string,
): Promise<OrgResult<DietPlanRecord>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  // Fetch plan with member and trainer
  const { data: planData, error: planError } = await supabase
    .from("diet_plans")
    .select(
      `
      id, organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_at, updated_at,
      gym_members(id, full_name, first_name, last_name, code, phone),
      trainers(id, full_name, first_name, last_name)
    `,
    )
    .eq("organization_id", organizationId)
    .eq("id", planId)
    .maybeSingle();

  if (planError) return { data: null, error: { message: friendlyMessage(planError) } };
  if (!planData) return { data: null, error: { message: "Diet plan not found." } };

  // Fetch items
  const { data: itemsData, error: itemsError } = await supabase
    .from("diet_plan_items")
    .select(
      `
      id, diet_plan_id, meal, meal_time, food_name, description,
      quantity, unit, calories, protein_g, carbs_g, fat_g, instructions, sort_order
    `,
    )
    .eq("organization_id", organizationId)
    .eq("diet_plan_id", planId)
    .order("sort_order", { ascending: true });

  if (itemsError) return { data: null, error: { message: friendlyMessage(itemsError) } };

  const memberRow = planData.gym_members as { full_name?: string; first_name?: string; last_name?: string; code?: string; phone?: string } | null;
  const memberName = embedName(memberRow) ?? "Member";

  const items: DietFoodItem[] = (itemsData ?? []).map((i, idx) => ({
    id: i.id,
    meal: i.meal || "Meal",
    mealTime: i.meal_time || null,
    foodName: i.food_name || i.description || "Food Item",
    quantity: i.quantity != null ? Number(i.quantity) : null,
    unit: i.unit || null,
    calories: i.calories != null ? Number(i.calories) : null,
    proteinG: i.protein_g != null ? Number(i.protein_g) : null,
    carbsG: i.carbs_g != null ? Number(i.carbs_g) : null,
    fatG: i.fat_g != null ? Number(i.fat_g) : null,
    instructions: i.instructions || null,
    sortOrder: i.sort_order ?? idx,
  }));

  const record: DietPlanRecord = {
    id: planData.id,
    organizationId: planData.organization_id,
    memberId: planData.member_id,
    memberName,
    memberCode: memberRow?.code,
    memberPhone: memberRow?.phone,
    trainerId: planData.trainer_id,
    trainerName: embedName(planData.trainers),
    name: planData.name,
    goal: (planData.goal as DietPlanGoal) || null,
    status: (planData.status as DietPlanStatus) || (planData.is_active ? "active" : "completed"),
    dailyCalorieTarget: planData.daily_calorie_target != null ? Number(planData.daily_calorie_target) : null,
    proteinTargetG: planData.protein_target_g != null ? Number(planData.protein_target_g) : null,
    carbTargetG: planData.carb_target_g != null ? Number(planData.carb_target_g) : null,
    fatTargetG: planData.fat_target_g != null ? Number(planData.fat_target_g) : null,
    waterIntakeLiters: planData.water_intake_liters != null ? Number(planData.water_intake_liters) : null,
    startDate: planData.start_date,
    endDate: planData.end_date,
    notes: planData.notes,
    isActive: planData.is_active,
    items,
    createdAt: planData.created_at,
    updatedAt: planData.updated_at,
  };

  return { data: record, error: null };
}

export async function fetchDietPlansList(
  organizationId: string,
  options?: {
    status?: string;
    goal?: string;
    search?: string;
    trainerId?: string;
    memberId?: string;
  },
): Promise<OrgResult<{ rows: DietPlanRecord[]; summary: { total: number; active: number; draft: number; completed: number } }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  let query = supabase
    .from("diet_plans")
    .select(
      `
      id, organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_at, updated_at,
      gym_members(id, full_name, first_name, last_name, code, phone),
      trainers(id, full_name, first_name, last_name)
    `,
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options?.trainerId) {
    query = query.eq("trainer_id", options.trainerId);
  }

  if (options?.memberId) {
    query = query.eq("member_id", options.memberId);
  }

  const { data, error } = await query;
  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const allRecords: DietPlanRecord[] = (data ?? []).map((row) => {
    const memberRow = row.gym_members as { full_name?: string; first_name?: string; last_name?: string; code?: string; phone?: string } | null;
    const memberName = embedName(memberRow) ?? "Member";
    const status = (row.status as DietPlanStatus) || (row.is_active ? "active" : "completed");

    return {
      id: row.id,
      organizationId: row.organization_id,
      memberId: row.member_id,
      memberName,
      memberCode: memberRow?.code,
      memberPhone: memberRow?.phone,
      trainerId: row.trainer_id,
      trainerName: embedName(row.trainers),
      name: row.name,
      goal: (row.goal as DietPlanGoal) || null,
      status,
      dailyCalorieTarget: row.daily_calorie_target != null ? Number(row.daily_calorie_target) : null,
      proteinTargetG: row.protein_target_g != null ? Number(row.protein_target_g) : null,
      carbTargetG: row.carb_target_g != null ? Number(row.carb_target_g) : null,
      fatTargetG: row.fat_target_g != null ? Number(row.fat_target_g) : null,
      waterIntakeLiters: row.water_intake_liters != null ? Number(row.water_intake_liters) : null,
      startDate: row.start_date,
      endDate: row.end_date,
      notes: row.notes,
      isActive: row.is_active,
      items: [],
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  });

  // Calculate summary counts across all fetched records before client-side filter
  const summary = {
    total: allRecords.length,
    active: allRecords.filter((r) => r.status === "active").length,
    draft: allRecords.filter((r) => r.status === "draft").length,
    completed: allRecords.filter((r) => r.status === "completed").length,
  };

  // Filter in memory for search, status, and goal
  let filtered = allRecords;

  if (options?.status && options.status !== "all") {
    filtered = filtered.filter((r) => r.status === options.status);
  }

  if (options?.goal && options.goal !== "all") {
    filtered = filtered.filter((r) => r.goal === options.goal);
  }

  if (options?.search) {
    const q = options.search.toLowerCase().trim();
    filtered = filtered.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.memberName?.toLowerCase().includes(q) ||
        r.memberCode?.toLowerCase().includes(q) ||
        r.memberPhone?.toLowerCase().includes(q),
    );
  }

  return { data: { rows: filtered, summary }, error: null };
}

/**
 * Fetches the currently published/active diet plan for an authenticated member.
 */
export async function fetchMemberCurrentDietPlan(
  organizationId: string,
  memberId: string,
): Promise<OrgResult<DietPlanRecord | null>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  // Members can only read published plans (active or completed)
  const { data: planData, error: planError } = await supabase
    .from("diet_plans")
    .select(
      `
      id, organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_at, updated_at,
      gym_members(id, full_name, first_name, last_name, code),
      trainers(id, full_name, first_name, last_name)
    `,
    )
    .eq("organization_id", organizationId)
    .eq("member_id", memberId)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) return { data: null, error: { message: friendlyMessage(planError) } };
  if (!planData) return { data: null, error: null };

  // Fetch full items for the active plan
  const { data: itemsData, error: itemsError } = await supabase
    .from("diet_plan_items")
    .select(
      `
      id, diet_plan_id, meal, meal_time, food_name, description,
      quantity, unit, calories, protein_g, carbs_g, fat_g, instructions, sort_order
    `,
    )
    .eq("organization_id", organizationId)
    .eq("diet_plan_id", planData.id)
    .order("sort_order", { ascending: true });

  if (itemsError) return { data: null, error: { message: friendlyMessage(itemsError) } };

  const memberRow = planData.gym_members as { full_name?: string; first_name?: string; last_name?: string; code?: string } | null;
  const items: DietFoodItem[] = (itemsData ?? []).map((i, idx) => ({
    id: i.id,
    meal: i.meal || "Meal",
    mealTime: i.meal_time || null,
    foodName: i.food_name || i.description || "Food Item",
    quantity: i.quantity != null ? Number(i.quantity) : null,
    unit: i.unit || null,
    calories: i.calories != null ? Number(i.calories) : null,
    proteinG: i.protein_g != null ? Number(i.protein_g) : null,
    carbsG: i.carbs_g != null ? Number(i.carbs_g) : null,
    fatG: i.fat_g != null ? Number(i.fat_g) : null,
    instructions: i.instructions || null,
    sortOrder: i.sort_order ?? idx,
  }));

  const record: DietPlanRecord = {
    id: planData.id,
    organizationId: planData.organization_id,
    memberId: planData.member_id,
    memberName: embedName(memberRow) ?? "Member",
    memberCode: memberRow?.code,
    trainerId: planData.trainer_id,
    trainerName: embedName(planData.trainers),
    name: planData.name,
    goal: (planData.goal as DietPlanGoal) || null,
    status: "active",
    dailyCalorieTarget: planData.daily_calorie_target != null ? Number(planData.daily_calorie_target) : null,
    proteinTargetG: planData.protein_target_g != null ? Number(planData.protein_target_g) : null,
    carbTargetG: planData.carb_target_g != null ? Number(planData.carb_target_g) : null,
    fatTargetG: planData.fat_target_g != null ? Number(planData.fat_target_g) : null,
    waterIntakeLiters: planData.water_intake_liters != null ? Number(planData.water_intake_liters) : null,
    startDate: planData.start_date,
    endDate: planData.end_date,
    notes: planData.notes,
    isActive: true,
    items,
    createdAt: planData.created_at,
    updatedAt: planData.updated_at,
  };

  return { data: record, error: null };
}

/**
 * Fetches previous completed plans for a member (history).
 */
export async function fetchMemberDietPlanHistory(
  organizationId: string,
  memberId: string,
): Promise<OrgResult<DietPlanRecord[]>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  const { data, error } = await supabase
    .from("diet_plans")
    .select(
      `
      id, organization_id, member_id, trainer_id, name, goal, status,
      daily_calorie_target, protein_target_g, carb_target_g, fat_target_g, water_intake_liters,
      start_date, end_date, notes, is_active, created_at, updated_at,
      trainers(id, full_name, first_name, last_name)
    `,
    )
    .eq("organization_id", organizationId)
    .eq("member_id", memberId)
    .eq("status", "completed")
    .order("created_at", { ascending: false });

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  const records: DietPlanRecord[] = (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    memberId: row.member_id,
    trainerId: row.trainer_id,
    trainerName: embedName(row.trainers),
    name: row.name,
    goal: (row.goal as DietPlanGoal) || null,
    status: "completed",
    dailyCalorieTarget: row.daily_calorie_target != null ? Number(row.daily_calorie_target) : null,
    proteinTargetG: row.protein_target_g != null ? Number(row.protein_target_g) : null,
    carbTargetG: row.carb_target_g != null ? Number(row.carb_target_g) : null,
    fatTargetG: row.fat_target_g != null ? Number(row.fat_target_g) : null,
    waterIntakeLiters: row.water_intake_liters != null ? Number(row.water_intake_liters) : null,
    startDate: row.start_date,
    endDate: row.end_date,
    notes: row.notes,
    isActive: false,
    items: [],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));

  return { data: records, error: null };
}

/**
 * Creates or updates a full diet plan with its meal schedule items.
 */
export async function saveFullDietPlan(
  organizationId: string,
  plan: {
    id?: string;
    memberId: string;
    trainerId?: string | null;
    name: string;
    goal?: DietPlanGoal | null;
    status: DietPlanStatus;
    dailyCalorieTarget?: number | null;
    proteinTargetG?: number | null;
    carbTargetG?: number | null;
    fatTargetG?: number | null;
    waterIntakeLiters?: number | null;
    startDate?: string | null;
    endDate?: string | null;
    notes?: string | null;
    items?: DietFoodItem[] | null;
  },
): Promise<OrgResult<{ id: string }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  const planStatus = plan.status || "draft";

  // Prepare jsonb items payload: null preserves existing items; array explicitly replaces
  const itemsPayload =
    plan.items != null
      ? plan.items.map((i, idx) => ({
          meal: i.meal,
          mealTime: i.mealTime || null,
          foodName: i.foodName,
          description: i.foodName,
          quantity: i.quantity ?? null,
          unit: i.unit || null,
          calories: i.calories ?? null,
          proteinG: i.proteinG ?? null,
          carbsG: i.carbsG ?? null,
          fatG: i.fatG ?? null,
          instructions: i.instructions || null,
          sortOrder: i.sortOrder ?? idx,
        }))
      : null;

  // Try RPC save_full_diet_plan first
  const { data: rpcData, error: rpcError } = await callRpc("save_full_diet_plan", {
    p_org_id: organizationId,
    p_plan_id: plan.id || null,
    p_member_id: plan.memberId,
    p_trainer_id: plan.trainerId || null,
    p_name: plan.name,
    p_goal: plan.goal || null,
    p_status: planStatus,
    p_start_date: plan.startDate || null,
    p_end_date: plan.endDate || null,
    p_daily_calorie_target: plan.dailyCalorieTarget ?? null,
    p_protein_target_g: plan.proteinTargetG ?? null,
    p_carb_target_g: plan.carbTargetG ?? null,
    p_fat_target_g: plan.fatTargetG ?? null,
    p_water_intake_liters: plan.waterIntakeLiters ?? null,
    p_notes: plan.notes || null,
    p_items: itemsPayload,
  });

  if (!rpcError && rpcData) {
    return { data: { id: String(rpcData) }, error: null };
  }

  if (rpcError) {
    const msg = (rpcError.message || "").toLowerCase();
    const isMissingRpc = msg.includes("does not exist") || (msg.includes("function") && msg.includes("not found"));
    if (!isMissingRpc) {
      return { data: null, error: { message: friendlyMessage(rpcError) } };
    }
  }

  // Graceful client-side fallback ONLY if RPC is not yet loaded in DB
  const isActive = plan.status === "active";

  if (isActive) {
    // Complete previous active plans
    await supabase
      .from("diet_plans")
      .update({ status: "completed", is_active: false })
      .eq("organization_id", organizationId)
      .eq("member_id", plan.memberId)
      .eq("status", "active");
  }

  let planId = plan.id;

  if (planId) {
    const { error: updateError } = await supabase
      .from("diet_plans")
      .update({
        member_id: plan.memberId,
        trainer_id: plan.trainerId || null,
        name: plan.name,
        goal: plan.goal || null,
        status: plan.status,
        daily_calorie_target: plan.dailyCalorieTarget ?? null,
        protein_target_g: plan.proteinTargetG ?? null,
        carb_target_g: plan.carbTargetG ?? null,
        fat_target_g: plan.fatTargetG ?? null,
        water_intake_liters: plan.waterIntakeLiters ?? null,
        start_date: plan.startDate || null,
        end_date: plan.endDate || null,
        notes: plan.notes || null,
        is_active: isActive,
      })
      .eq("organization_id", organizationId)
      .eq("id", planId);

    if (updateError) return { data: null, error: { message: friendlyMessage(updateError) } };
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("diet_plans")
      .insert({
        organization_id: organizationId,
        member_id: plan.memberId,
        trainer_id: plan.trainerId || null,
        name: plan.name,
        goal: plan.goal || null,
        status: plan.status,
        daily_calorie_target: plan.dailyCalorieTarget ?? null,
        protein_target_g: plan.proteinTargetG ?? null,
        carb_target_g: plan.carbTargetG ?? null,
        fat_target_g: plan.fatTargetG ?? null,
        water_intake_liters: plan.waterIntakeLiters ?? null,
        start_date: plan.startDate || null,
        end_date: plan.endDate || null,
        notes: plan.notes || null,
        is_active: isActive,
      })
      .select("id")
      .single();

    if (insertError) return { data: null, error: { message: friendlyMessage(insertError) } };
    planId = inserted.id;
  }

  // Replace items only when itemsPayload is explicitly provided (null preserves existing items)
  if (itemsPayload !== null) {
    await supabase.from("diet_plan_items").delete().eq("diet_plan_id", planId);

    if (itemsPayload.length > 0) {
      const rowsToInsert = itemsPayload.map((item, idx) => ({
        organization_id: organizationId,
        diet_plan_id: planId,
        meal: item.meal,
        meal_time: item.mealTime,
        food_name: item.foodName,
        description: item.description,
        quantity: item.quantity,
        unit: item.unit,
        calories: item.calories,
        protein_g: item.proteinG,
        carbs_g: item.carbsG,
        fat_g: item.fatG,
        instructions: item.instructions,
        sort_order: item.sortOrder ?? idx,
      }));

      const { error: itemsInsertError } = await supabase.from("diet_plan_items").insert(rowsToInsert);
      if (itemsInsertError) {
        return { data: null, error: { message: friendlyMessage(itemsInsertError) } };
      }
    }
  }

  return { data: { id: planId }, error: null };
}

export async function publishDietPlan(planId: string): Promise<OrgResult<void>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  const { error: rpcError } = await callRpc("publish_diet_plan", { p_plan_id: planId });
  if (!rpcError) return { data: undefined, error: null };

  const msg = (rpcError.message || "").toLowerCase();
  const isMissingRpc = msg.includes("does not exist") || (msg.includes("function") && msg.includes("not found"));
  if (!isMissingRpc) {
    return { data: null, error: { message: friendlyMessage(rpcError) } };
  }

  // Fallback only if RPC does not exist
  const { data: plan } = await supabase.from("diet_plans").select("organization_id, member_id").eq("id", planId).single();
  if (plan) {
    await supabase
      .from("diet_plans")
      .update({ status: "completed", is_active: false })
      .eq("organization_id", plan.organization_id)
      .eq("member_id", plan.member_id)
      .eq("status", "active")
      .neq("id", planId);

    const { error } = await supabase.from("diet_plans").update({ status: "active", is_active: true }).eq("id", planId);
    if (error) return { data: null, error: { message: friendlyMessage(error) } };
  }

  return { data: undefined, error: null };
}

export async function completeDietPlan(planId: string): Promise<OrgResult<void>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  const { error: rpcError } = await callRpc("complete_diet_plan", { p_plan_id: planId });
  if (!rpcError) return { data: undefined, error: null };

  const msg = (rpcError.message || "").toLowerCase();
  const isMissingRpc = msg.includes("does not exist") || (msg.includes("function") && msg.includes("not found"));
  if (!isMissingRpc) {
    return { data: null, error: { message: friendlyMessage(rpcError) } };
  }

  const { error } = await supabase.from("diet_plans").update({ status: "completed", is_active: false }).eq("id", planId);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  return { data: undefined, error: null };
}

export async function cloneDietPlanToDraft(
  organizationId: string,
  planId: string,
): Promise<OrgResult<{ id: string }>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase client not initialized." } };

  const { data: rpcData, error: rpcError } = await callRpc("clone_diet_plan_to_draft", {
    p_plan_id: planId,
  });

  if (!rpcError && rpcData) {
    return { data: { id: String(rpcData) }, error: null };
  }

  if (rpcError) {
    const msg = (rpcError.message || "").toLowerCase();
    const isMissingRpc = msg.includes("does not exist") || (msg.includes("function") && msg.includes("not found"));
    if (!isMissingRpc) {
      return { data: null, error: { message: friendlyMessage(rpcError) } };
    }
  }

  // Graceful client fallback if RPC is not loaded in DB
  const { data: sourcePlan, error: fetchError } = await fetchDietPlanById(organizationId, planId);
  if (fetchError || !sourcePlan) {
    return { data: null, error: { message: fetchError?.message || "Source plan not found" } };
  }

  if (sourcePlan.status !== "active" && sourcePlan.status !== "completed") {
    return { data: null, error: { message: "Only active or completed diet plans can be cloned to draft." } };
  }

  return saveFullDietPlan(organizationId, {
    memberId: sourcePlan.memberId,
    trainerId: sourcePlan.trainerId,
    name: `${sourcePlan.name} (Draft)`,
    goal: sourcePlan.goal || undefined,
    status: "draft",
    dailyCalorieTarget: sourcePlan.dailyCalorieTarget,
    proteinTargetG: sourcePlan.proteinTargetG,
    carbTargetG: sourcePlan.carbTargetG,
    fatTargetG: sourcePlan.fatTargetG,
    waterIntakeLiters: sourcePlan.waterIntakeLiters,
    startDate: sourcePlan.startDate,
    endDate: sourcePlan.endDate,
    notes: sourcePlan.notes,
    items: sourcePlan.items,
  });
}

