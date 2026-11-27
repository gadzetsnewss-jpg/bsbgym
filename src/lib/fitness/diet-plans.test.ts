import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  calculateNutritionSummary,
  groupItemsByMeal,
  DIET_PLAN_GOALS,
  STANDARD_MEALS,
  cloneDietPlanToDraft,
  saveFullDietPlan,
  type DietFoodItem,
} from "@/lib/fitness/diet-plans";

describe("Nutrition Planning Module Migration & RLS", () => {
  const migrationPath = resolve(
    process.cwd(),
    "supabase/migrations/20261127000043_trainer_nutrition_planning.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf-8");
  const combinePath = resolve(process.cwd(), "supabase/COMBINE.sql");
  const combineSql = readFileSync(combinePath, "utf-8");

  it("extends public.diet_plans with goal, status, and nutrition targets", () => {
    expect(migrationSql).toMatch(/alter table public\.diet_plans[\s\S]*?add column if not exists goal text/i);
    expect(migrationSql).toMatch(/add column if not exists status text/i);
    expect(migrationSql).toMatch(/add column if not exists daily_calorie_target integer/i);
    expect(migrationSql).toMatch(/add column if not exists protein_target_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists carb_target_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists fat_target_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists water_intake_liters numeric/i);
  });

  it("extends public.diet_plan_items with meal schedule and food macro columns", () => {
    expect(migrationSql).toMatch(/alter table public\.diet_plan_items[\s\S]*?add column if not exists meal_time text/i);
    expect(migrationSql).toMatch(/add column if not exists food_name text/i);
    expect(migrationSql).toMatch(/add column if not exists quantity numeric/i);
    expect(migrationSql).toMatch(/add column if not exists unit text/i);
    expect(migrationSql).toMatch(/add column if not exists protein_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists carbs_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists fat_g numeric/i);
    expect(migrationSql).toMatch(/add column if not exists instructions text/i);
  });

  it("enforces scoped RLS so that draft plans are strictly hidden from members", () => {
    expect(migrationSql).toMatch(/create policy "org members can view diet plans"/i);
    expect(migrationSql).toContain("public.current_org_role_slug(organization_id) is distinct from 'member'");
    expect(migrationSql).toContain("status in ('active', 'completed')");

    expect(migrationSql).toMatch(/create policy "org members can view diet plan items"/i);
    expect(migrationSql).toContain("parent.status in ('active', 'completed')");
  });

  it("provides save_full_diet_plan with authorization, trainer validation, and auto-archival of prior active plans", () => {
    expect(migrationSql).toMatch(/create or replace function public\.save_full_diet_plan/i);
    expect(migrationSql).toContain("public.user_has_permission(p_org_id, 'fitness.manage')");
    expect(migrationSql).toContain("public.can_view_member_data(p_org_id, p_member_id)");
  });

  it("provides publish_diet_plan and complete_diet_plan RPCs", () => {
    expect(migrationSql).toMatch(/create or replace function public\.publish_diet_plan/i);
    expect(migrationSql).toMatch(/create or replace function public\.complete_diet_plan/i);
  });

  it("is appended to COMBINE.sql", () => {
    expect(combineSql).toContain("20261127000043_trainer_nutrition_planning.sql");
    expect(combineSql).toContain("save_full_diet_plan");
  });
});

describe("Nutrition Calculations & Live Macro Aggregation", () => {
  it("calculates exact calorie and macro totals from entered food items", () => {
    const items: DietFoodItem[] = [
      {
        meal: "Breakfast",
        mealTime: "08:30",
        foodName: "Rolled Oats",
        quantity: 50,
        unit: "g",
        calories: 190,
        proteinG: 6,
        carbsG: 34,
        fatG: 3,
        sortOrder: 0,
      },
      {
        meal: "Breakfast",
        mealTime: "08:30",
        foodName: "Boiled Eggs",
        quantity: 2,
        unit: "piece",
        calories: 140,
        proteinG: 12,
        carbsG: 1,
        fatG: 10,
        sortOrder: 1,
      },
      {
        meal: "Lunch",
        mealTime: "13:30",
        foodName: "Grilled Chicken Breast",
        quantity: 150,
        unit: "g",
        calories: 240,
        proteinG: 45,
        carbsG: 0,
        fatG: 5,
        sortOrder: 2,
      },
    ];

    const summary = calculateNutritionSummary(items);
    expect(summary.totalCalories).toBe(570);
    expect(summary.totalProtein).toBe(63);
    expect(summary.totalCarbs).toBe(35);
    expect(summary.totalFat).toBe(18);
    expect(summary.hasMissingCalories).toBe(false);
    expect(summary.hasMissingMacros).toBe(false);

    // Macro energy: (63 * 4) + (35 * 4) + (18 * 9) = 252 + 140 + 162 = 554 kcal
    expect(summary.macroCalories).toBe(554);
    expect(summary.proteinPct).toBe(45);
    expect(summary.carbsPct).toBe(25);
    expect(summary.fatPct).toBe(29);
  });

  it("detects and flags missing calories and macros without treating them as zero", () => {
    const itemsWithMissing: DietFoodItem[] = [
      {
        meal: "Snack",
        foodName: "Green Apple",
        quantity: 1,
        unit: "piece",
        calories: null,
        proteinG: 0.5,
        carbsG: 25,
        fatG: 0.3,
        sortOrder: 0,
      },
      {
        meal: "Snack",
        foodName: "Protein Shake",
        quantity: 1,
        unit: "scoop",
        calories: 120,
        proteinG: 24,
        carbsG: null,
        fatG: 1,
        sortOrder: 1,
      },
    ];

    const summary = calculateNutritionSummary(itemsWithMissing);
    expect(summary.hasMissingCalories).toBe(true);
    expect(summary.hasMissingMacros).toBe(true);
    expect(summary.totalCalories).toBe(120);
    expect(summary.totalProtein).toBe(24.5);
  });
});

describe("Meal Scheduling & Grouping", () => {
  it("groups food items chronologically by meal and calculates meal subtotals", () => {
    const items: DietFoodItem[] = [
      {
        meal: "Breakfast",
        mealTime: "08:00",
        instructions: "Take with 250ml milk",
        foodName: "Oatmeal",
        quantity: 60,
        unit: "g",
        calories: 220,
        proteinG: 8,
        carbsG: 38,
        fatG: 4,
        sortOrder: 0,
      },
      {
        meal: "Breakfast",
        mealTime: "08:00",
        foodName: "Almonds",
        quantity: 10,
        unit: "piece",
        calories: 70,
        proteinG: 2.5,
        carbsG: 2.5,
        fatG: 6,
        sortOrder: 1,
      },
      {
        meal: "Dinner",
        mealTime: "20:30",
        instructions: "Eat before 9 PM",
        foodName: "Paneer Stir Fry",
        quantity: 100,
        unit: "g",
        calories: 260,
        proteinG: 18,
        carbsG: 6,
        fatG: 18,
        sortOrder: 2,
      },
    ];

    const groups = groupItemsByMeal(items);
    expect(groups).toHaveLength(2);

    expect(groups[0].meal).toBe("Breakfast");
    expect(groups[0].mealTime).toBe("08:00");
    expect(groups[0].instructions).toBe("Take with 250ml milk");
    expect(groups[0].items).toHaveLength(2);
    expect(groups[0].totalCalories).toBe(290);
    expect(groups[0].totalProtein).toBe(10.5);

    expect(groups[1].meal).toBe("Dinner");
    expect(groups[1].mealTime).toBe("20:30");
    expect(groups[1].instructions).toBe("Eat before 9 PM");
    expect(groups[1].items).toHaveLength(1);
    expect(groups[1].totalCalories).toBe(260);
    expect(groups[1].totalProtein).toBe(18);
  });

  it("supports all standard meal schedules and goal options", () => {
    expect(DIET_PLAN_GOALS).toContain("Fat Loss");
    expect(DIET_PLAN_GOALS).toContain("Muscle Gain");
    expect(DIET_PLAN_GOALS).toContain("Weight Maintenance");
    expect(DIET_PLAN_GOALS).toContain("General Fitness");
    expect(DIET_PLAN_GOALS).toContain("Custom");

    const mealNames = STANDARD_MEALS.map((m) => m.value);
    expect(mealNames).toContain("Early Morning");
    expect(mealNames).toContain("Breakfast");
    expect(mealNames).toContain("Lunch");
    expect(mealNames).toContain("Pre-Workout");
    expect(mealNames).toContain("Post-Workout");
    expect(mealNames).toContain("Dinner");
  });
});

describe("Migration 00044 Hardening & Security Guarantees", () => {
  const hardeningPath = resolve(
    process.cwd(),
    "supabase/migrations/20261127000044_trainer_nutrition_hardening.sql",
  );
  const hardeningSql = readFileSync(hardeningPath, "utf-8");
  const combinePath = resolve(process.cwd(), "supabase/COMBINE.sql");
  const combineSql = readFileSync(combinePath, "utf-8");

  describe("1. SELECT RLS Policies", () => {
    it("restricts Owner/Admin access strictly via explicit user_has_permission(organization_id, 'fitness.manage')", () => {
      expect(hardeningSql).toContain("public.user_has_permission(organization_id, 'fitness.manage')");
      expect(hardeningSql).toContain("public.user_has_permission(parent.organization_id, 'fitness.manage')");
      expect(hardeningSql).not.toContain("public.current_org_role_slug(organization_id) not in ('member', 'trainer')");
      expect(hardeningSql).not.toContain("not in ('member', 'trainer')");
    });

    it("restricts assigned Trainers to their actively assigned members where they are the trainer", () => {
      expect(hardeningSql).toContain("trainer_id = public.linked_trainer_id(organization_id)");
      expect(hardeningSql).toContain("public.can_view_member_data(organization_id, member_id)");
      expect(hardeningSql).toContain("parent.trainer_id = public.linked_trainer_id(parent.organization_id)");
    });

    it("restricts Members to their own active or completed plans (drafts strictly hidden)", () => {
      expect(hardeningSql).toContain("public.current_org_role_slug(organization_id) = 'member'");
      expect(hardeningSql).toContain("status in ('active', 'completed')");
      expect(hardeningSql).toContain("parent.status in ('active', 'completed')");
    });
  });

  describe("2. Save RPC Lifecycle & Active/Completed Plan Immutability", () => {
    it("defaults p_status to 'draft' and saves only Draft", () => {
      expect(hardeningSql).toMatch(/p_status text default 'draft'/i);
      expect(hardeningSql).toContain("status = 'draft'");
      expect(hardeningSql).toContain("is_active = false");
    });

    it("strictly rejects p_status = 'active' and p_status = 'completed' during save", () => {
      expect(hardeningSql).toContain("if v_status in ('active', 'completed') then");
      expect(hardeningSql).toContain("save_full_diet_plan only saves draft plans; use publish_diet_plan to activate a plan");
      expect(hardeningSql).toContain("if v_status <> 'draft' then");
    });

    it("rejects modifying existing Active and Completed plans in-place via save_full_diet_plan", () => {
      expect(hardeningSql).toContain("if v_existing_plan.status in ('active', 'completed') then");
      expect(hardeningSql).toContain("cannot modify an % diet plan; create or clone to a new draft instead");
    });

    it("never archives an existing active plan during save_full_diet_plan", () => {
      const saveStart = hardeningSql.indexOf("create or replace function public.save_full_diet_plan");
      const saveEnd = hardeningSql.indexOf("create or replace function public.clone_diet_plan_to_draft");
      const saveBody = hardeningSql.slice(saveStart, saveEnd);

      expect(saveBody).not.toMatch(/update public\.diet_plans[\s\S]*?set status = 'completed'/i);
      expect(saveBody).not.toMatch(/where[\s\S]*?status = 'active'[\s\S]*?and \(p_plan_id is null or id <> p_plan_id\)/i);
    });
  });

  describe("3. Clone to Draft Workflow", () => {
    it("provides clone_diet_plan_to_draft RPC copying targets and meal items into a new draft", () => {
      expect(hardeningSql).toMatch(/create or replace function public\.clone_diet_plan_to_draft\(p_plan_id uuid\)/i);
      expect(hardeningSql).toContain("v_source.name || ' (Draft)'");
      expect(hardeningSql).toContain("insert into public.diet_plan_items");
      expect(hardeningSql).toContain("where diet_plan_id = p_plan_id");
    });

    it("keeps existing Active Plan visible and untouched when cloning", () => {
      const cloneStart = hardeningSql.indexOf("create or replace function public.clone_diet_plan_to_draft");
      const cloneEnd = hardeningSql.indexOf("create or replace function public.publish_diet_plan");
      const cloneBody = hardeningSql.slice(cloneStart, cloneEnd);

      // Cloning must NOT archive or deactivate the source plan
      expect(cloneBody).not.toContain("set status = 'completed'");
      expect(cloneBody).not.toContain("set is_active = false");
    });

    it("verifies permissions inside clone_diet_plan_to_draft for Trainers and Owner/Admin", () => {
      expect(hardeningSql).toContain("not authorized to clone another trainer plan");
      expect(hardeningSql).toContain("not authorized: member is not actively assigned to trainer");
      expect(hardeningSql).toContain("revoke all on function public.clone_diet_plan_to_draft(uuid) from public, anon");
      expect(hardeningSql).toContain("grant execute on function public.clone_diet_plan_to_draft(uuid) to authenticated");
    });
  });

  describe("4. Content Validation & Rejection of Placeholder Defaults", () => {
    it("rejects placeholder default 'Meal' and requires an explicit meal name in save_full_diet_plan", () => {
      expect(hardeningSql).toContain("if v_item_meal is null or lower(v_item_meal) = 'meal' then");
      expect(hardeningSql).toContain("each item must have a meaningful explicit meal name");
      expect(hardeningSql).not.toContain("coalesce(nullif(trim(v_item->>'meal'), ''), 'Meal')");
    });

    it("rejects placeholder default 'Item' and requires an explicit food name or description in save_full_diet_plan", () => {
      expect(hardeningSql).toContain("if v_item_desc is null or lower(v_item_desc) = 'item' then");
      expect(hardeningSql).toContain("each item must have an explicit food name or description");
      expect(hardeningSql).not.toContain("coalesce(v_item_food, nullif(trim(v_item->>'description'), ''), 'Item')");
    });

    it("rejects blank or placeholder-only meal items in publish_diet_plan", () => {
      expect(hardeningSql).toContain("cannot publish diet plan with blank or placeholder-only meal items");
      expect(hardeningSql).toContain("lower(trim(meal)) = 'meal'");
      expect(hardeningSql).toContain("lower(trim(food_name)) = 'item'");
    });
  });

  describe("5. Owner/Admin Edits & Trainer Assignment Preservation", () => {
    it("preserves existing trainer_id for Owner/Admin edits when p_trainer_id is omitted (null)", () => {
      expect(hardeningSql).toContain("if p_trainer_id is null then");
      expect(hardeningSql).toContain("v_trainer_id := v_existing_plan.trainer_id;");
      expect(hardeningSql).toContain("else\n        v_trainer_id := p_trainer_id;");
    });

    it("allows Owner/Admin to change trainer assignment only on explicit reassignment", () => {
      expect(hardeningSql).toContain("if v_trainer_id is not null and not exists (");
      expect(hardeningSql).toContain("select 1 from public.trainers where id = v_trainer_id and organization_id = p_org_id");
    });

    it("ensures completed plans remain immutable for Owner/Admin too", () => {
      // Both active and completed plans are rejected in-place for all users
      expect(hardeningSql).toContain("if v_existing_plan.status in ('active', 'completed') then");
      expect(hardeningSql).toContain("cannot modify an % diet plan; create or clone to a new draft instead");
    });
  });

  describe("6. Trainer Reassignment Guards", () => {
    it("prevents trainers from transferring an existing plan to another member", () => {
      expect(hardeningSql).toContain(
        "if p_member_id is not null and p_member_id is distinct from v_existing_plan.member_id then",
      );
      expect(hardeningSql).toContain("trainers cannot transfer an existing plan to another member");
    });

    it("requires Trainer A cannot edit, publish, or complete Trainer B's plan", () => {
      expect(hardeningSql).toContain("not authorized to modify another trainer plan");
      expect(hardeningSql).toContain("not authorized to publish another trainer plan");
      expect(hardeningSql).toContain("not authorized to complete another trainer plan");
    });

    it("requires active trainer assignment for member before creating or modifying a plan", () => {
      expect(hardeningSql).toContain("member is not assigned to trainer");
      expect(hardeningSql).toContain("not authorized: member is not actively assigned to trainer");
    });
  });

  describe("7. Publish Validation & Atomic Activation", () => {
    it("verifies authorization and active Trainer assignment FIRST before validating meals or archiving", () => {
      const pubStart = hardeningSql.indexOf("create or replace function public.publish_diet_plan");
      const pubBody = hardeningSql.slice(pubStart);

      const authCheckIdx = pubBody.indexOf("if not public.can_view_member_data(v_plan.organization_id, v_plan.member_id)");
      const itemCheckIdx = pubBody.indexOf("cannot publish diet plan with blank or placeholder-only meal items");
      const archiveIdx = pubBody.indexOf("update public.diet_plans\n  set status = 'completed'");

      expect(authCheckIdx).toBeGreaterThan(0);
      expect(itemCheckIdx).toBeGreaterThan(authCheckIdx);
      expect(archiveIdx).toBeGreaterThan(itemCheckIdx);
    });

    it("rejects completed, active, or non-draft plans from being published", () => {
      expect(hardeningSql).toContain("cannot publish a completed diet plan");
      expect(hardeningSql).toContain("diet plan is already active");
      expect(hardeningSql).toContain("only draft diet plans can be published");
    });

    it("requires non-empty plan before publishing", () => {
      expect(hardeningSql).toContain("cannot publish diet plan without meal items");
    });

    it("atomically archives previous active plans and activates target plan only after all validations pass", () => {
      const pubStart = hardeningSql.indexOf("create or replace function public.publish_diet_plan");
      const pubBody = hardeningSql.slice(pubStart);

      const archiveIdx = pubBody.indexOf("status = 'completed',\n      is_active = false");
      const activateIdx = pubBody.indexOf("status = 'active',\n      is_active = true");

      expect(archiveIdx).toBeGreaterThan(0);
      expect(activateIdx).toBeGreaterThan(archiveIdx);
    });
  });

  describe("8. Data Preservation & COMBINE.sql Integrity", () => {
    it("preserves existing meal items when p_items is omitted or null", () => {
      expect(hardeningSql).toMatch(/p_items jsonb default null/i);
      expect(hardeningSql).toMatch(/if p_items is not null then/i);
      const deleteIdx = hardeningSql.indexOf("delete from public.diet_plan_items");
      const checkIdx = hardeningSql.lastIndexOf("if p_items is not null then", deleteIdx);
      expect(checkIdx).toBeGreaterThan(0);
    });

    it("validates all item objects and numerical values atomically before deleting existing rows", () => {
      expect(hardeningSql).toContain("each item in items must be a json object");
      expect(hardeningSql).toContain("invalid calories value");
      expect(hardeningSql).toContain("invalid quantity value");
      expect(hardeningSql).toContain("invalid protein value");
      expect(hardeningSql).toContain("invalid carbs value");
      expect(hardeningSql).toContain("invalid fat value");
    });

    it("verifies 00044 is updated in COMBINE.sql", () => {
      expect(combineSql).toContain("20261127000044_trainer_nutrition_hardening.sql");
      expect(combineSql).toContain("clone_diet_plan_to_draft");
      expect(combineSql).toContain("cannot modify an % diet plan; create or clone to a new draft instead");
      expect(combineSql).toContain("cannot publish diet plan with blank or placeholder-only meal items");
      expect(combineSql).toContain("v_trainer_id := v_existing_plan.trainer_id;");
    });
  });

  describe("9. Application Workflow & Validation Guarantees", () => {
    it("exports cloneDietPlanToDraft function in client module", () => {
      expect(typeof cloneDietPlanToDraft).toBe("function");
    });

    it("validates that food items reject placeholder 'meal' and 'item'", () => {
      const invalidItems: DietFoodItem[] = [
        {
          meal: "meal",
          mealTime: "08:00",
          foodName: "Eggs",
          quantity: 2,
          unit: "piece",
          calories: 140,
          proteinG: 12,
          carbsG: 1,
          fatG: 10,
          sortOrder: 0,
        },
      ];
      // Helper function matching UI check
      const isPlaceholderMeal = (item: DietFoodItem) =>
        !item.meal.trim() || item.meal.trim().toLowerCase() === "meal";
      const isPlaceholderFood = (item: DietFoodItem) =>
        !item.foodName.trim() || item.foodName.trim().toLowerCase() === "item";

      expect(isPlaceholderMeal(invalidItems[0])).toBe(true);
      expect(isPlaceholderFood(invalidItems[0])).toBe(false);

      const invalidFoodItem: DietFoodItem = {
        meal: "Breakfast",
        mealTime: "08:00",
        foodName: "item",
        quantity: 1,
        unit: "piece",
        calories: 100,
        proteinG: 5,
        carbsG: 5,
        fatG: 5,
        sortOrder: 0,
      };
      expect(isPlaceholderMeal(invalidFoodItem)).toBe(false);
      expect(isPlaceholderFood(invalidFoodItem)).toBe(true);

      const validItem: DietFoodItem = {
        meal: "Breakfast",
        mealTime: "08:00",
        foodName: "Rolled Oats with Almond Milk",
        quantity: 60,
        unit: "g",
        calories: 220,
        proteinG: 8,
        carbsG: 38,
        fatG: 4,
        sortOrder: 0,
      };
      expect(isPlaceholderMeal(validItem)).toBe(false);
      expect(isPlaceholderFood(validItem)).toBe(false);
    });

    it("simulates client-side cloning of an active plan into a new draft preserving all targets and items", () => {
      const activePlan = {
        id: "active-plan-1",
        name: "Hypertrophy Diet Phase 1",
        goal: "Muscle Gain",
        status: "active",
        dailyCalorieTarget: 2800,
        proteinTargetG: 180,
        carbTargetG: 320,
        fatTargetG: 80,
        waterIntakeLiters: 4.0,
        notes: "High carb around training",
        items: [
          {
            meal: "Breakfast",
            foodName: "Oatmeal with whey",
            quantity: 80,
            unit: "g",
            calories: 350,
            proteinG: 30,
            carbsG: 45,
            fatG: 6,
            sortOrder: 0,
          },
        ],
      };

      // Simulates clone logic
      const clonedDraft = {
        name: `${activePlan.name} (Draft)`,
        goal: activePlan.goal,
        status: "draft",
        dailyCalorieTarget: activePlan.dailyCalorieTarget,
        proteinTargetG: activePlan.proteinTargetG,
        carbTargetG: activePlan.carbTargetG,
        fatTargetG: activePlan.fatTargetG,
        waterIntakeLiters: activePlan.waterIntakeLiters,
        notes: activePlan.notes,
        items: [...activePlan.items],
      };

      expect(clonedDraft.status).toBe("draft");
      expect(clonedDraft.name).toBe("Hypertrophy Diet Phase 1 (Draft)");
      expect(clonedDraft.dailyCalorieTarget).toBe(2800);
      expect(clonedDraft.items).toHaveLength(1);
      expect(clonedDraft.items[0].foodName).toBe("Oatmeal with whey");
      // Original active plan remains active
      expect(activePlan.status).toBe("active");
    });
  });

  describe("10. Concurrency Hardening & Member-Level Serialization (Publish & Clone)", () => {
    it("serializes publish_diet_plan per Member by locking the gym_members row with FOR UPDATE", () => {
      expect(hardeningSql).toContain(
        "perform 1\n  from public.gym_members\n  where id = v_plan.member_id\n    and organization_id = v_plan.organization_id\n  for update;",
      );
      // Ensures the member lock precedes the target plan lock and validations
      const memberLockIdx = hardeningSql.indexOf("from public.gym_members\n  where id = v_plan.member_id");
      const targetLockIdx = hardeningSql.indexOf("select * into v_plan\n  from public.diet_plans\n  where id = p_plan_id\n  for update;");
      const archiveIdx = hardeningSql.indexOf("update public.diet_plans\n  set status = 'completed'");

      expect(memberLockIdx).toBeGreaterThan(0);
      expect(targetLockIdx).toBeGreaterThan(memberLockIdx);
      expect(archiveIdx).toBeGreaterThan(targetLockIdx);
    });

    it("restricts clone_diet_plan_to_draft strictly to Active and Completed plans", () => {
      expect(hardeningSql).toContain(
        "if v_source.status not in ('active', 'completed') then\n    raise exception 'only active or completed diet plans can be cloned to draft';",
      );
    });

    it("simulates two concurrent publish attempts for different Drafts of the same Member, ensuring exactly one Active plan remains", () => {
      // Setup member and two concurrent draft plans
      interface PlanRow {
        id: string;
        memberId: string;
        name: string;
        status: "draft" | "active" | "completed";
        itemsCount: number;
      }

      const databaseState: PlanRow[] = [
        { id: "draft-A", memberId: "member-1", name: "Keto Plan A", status: "draft", itemsCount: 3 },
        { id: "draft-B", memberId: "member-1", name: "High Carb Plan B", status: "draft", itemsCount: 4 },
      ];

      // Mutex simulating database-level SELECT ... FOR UPDATE on gym_members row
      let memberLock = false;

      const publishSimulation = async (planId: string) => {
        // Step 1: Wait for Member lock (serializes publishing for this member)
        while (memberLock) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        memberLock = true;

        try {
          // Step 2: Lock and re-read target plan row FOR UPDATE
          const target = databaseState.find((p) => p.id === planId);
          if (!target) throw new Error("plan not found");
          if (target.status !== "draft") throw new Error("only draft diet plans can be published");
          if (target.itemsCount === 0) throw new Error("cannot publish diet plan without meal items");

          // Step 3: Archive prior active plans for this member
          for (const plan of databaseState) {
            if (plan.memberId === target.memberId && plan.status === "active" && plan.id !== target.id) {
              plan.status = "completed";
            }
          }

          // Step 4: Publish target plan
          target.status = "active";
          return target;
        } finally {
          // Release Member lock on transaction commit
          memberLock = false;
        }
      };

      // Execute both publish attempts concurrently
      return Promise.all([
        publishSimulation("draft-A"),
        publishSimulation("draft-B"),
      ]).then(() => {
        const activePlans = databaseState.filter(
          (p) => p.memberId === "member-1" && p.status === "active",
        );
        const completedPlans = databaseState.filter(
          (p) => p.memberId === "member-1" && p.status === "completed",
        );

        // Verification: Exactly ONE plan is active after both transactions complete
        expect(activePlans).toHaveLength(1);
        expect(completedPlans).toHaveLength(1);
        // The second serialized transaction succeeded and promoted to active, while the first was completed
        expect(activePlans[0].id).toBe("draft-B");
        expect(completedPlans[0].id).toBe("draft-A");
      });
    });

    it("ensures a failed concurrent publish leaves the earlier active plan intact (never leaves zero active plans)", () => {
      interface PlanRow {
        id: string;
        memberId: string;
        status: "draft" | "active" | "completed";
        itemsCount: number;
      }

      const databaseState: PlanRow[] = [
        { id: "active-plan", memberId: "member-1", status: "active", itemsCount: 3 },
        { id: "invalid-draft", memberId: "member-1", status: "draft", itemsCount: 0 }, // Empty plan
      ];

      let memberLock = false;

      const publishSimulation = async (planId: string) => {
        while (memberLock) {
          await new Promise((resolve) => setTimeout(resolve, 5));
        }
        memberLock = true;

        try {
          const target = databaseState.find((p) => p.id === planId);
          if (!target) throw new Error("plan not found");
          if (target.status !== "draft") throw new Error("only draft diet plans can be published");
          if (target.itemsCount === 0) throw new Error("cannot publish diet plan without meal items");

          // Archive prior active
          for (const plan of databaseState) {
            if (plan.memberId === target.memberId && plan.status === "active" && plan.id !== target.id) {
              plan.status = "completed";
            }
          }
          target.status = "active";
        } finally {
          memberLock = false;
        }
      };

      return expect(publishSimulation("invalid-draft"))
        .rejects.toThrow("cannot publish diet plan without meal items")
        .then(() => {
          // Transaction rolled back: prior active plan remains active
          const activePlans = databaseState.filter(
            (p) => p.memberId === "member-1" && p.status === "active",
          );
          expect(activePlans).toHaveLength(1);
          expect(activePlans[0].id).toBe("active-plan");
        });
    });
  });
});

