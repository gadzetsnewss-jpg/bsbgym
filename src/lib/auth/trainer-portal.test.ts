import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  TRAINER_NAV_ITEMS,
  TRAINER_NAV_SECTION,
  NAV_SECTIONS,
  FLAT_NAV_ITEMS,
} from "@/config/navigation";

const migration = readFileSync(
  join(
    process.cwd(),
    "supabase",
    "migrations",
    "20261123000039_trainer_portal_authorization.sql",
  ),
  "utf8",
);
const combine = readFileSync(join(process.cwd(), "COMBINE.sql"), "utf8");
const sidebar = readFileSync(
  join(process.cwd(), "src/components/layout/sidebar.tsx"),
  "utf8",
);
const membersList = readFileSync(
  join(process.cwd(), "src/components/members/members-list.tsx"),
  "utf8",
);
const memberDetail = readFileSync(
  join(process.cwd(), "src/components/members/member-detail.tsx"),
  "utf8",
);
const roleHome = readFileSync(
  join(process.cwd(), "src/components/dashboard/role-home.tsx"),
  "utf8",
);
const profileForm = readFileSync(
  join(process.cwd(), "src/components/settings/profile-form.tsx"),
  "utf8",
);
const progressScreen = readFileSync(
  join(process.cwd(), "src/components/fitness/progress-and-measurements.tsx"),
  "utf8",
);

describe("Trainer Portal — Exact Navigation and Scope", () => {
  it("defines EXACTLY the eight approved menu items in the exact order", () => {
    expect(TRAINER_NAV_ITEMS).toHaveLength(8);

    expect(TRAINER_NAV_ITEMS[0]).toMatchObject({
      title: "Dashboard",
      href: "/dashboard",
    });
    expect(TRAINER_NAV_ITEMS[1]).toMatchObject({
      title: "My Members",
      href: "/members",
    });
    expect(TRAINER_NAV_ITEMS[2]).toMatchObject({
      title: "PT Sessions",
      href: "/trainers/pt-sessions",
    });
    expect(TRAINER_NAV_ITEMS[3]).toMatchObject({
      title: "Workout Plans",
      href: "/fitness/workout-plans",
    });
    expect(TRAINER_NAV_ITEMS[4]).toMatchObject({
      title: "Diet Plans",
      href: "/fitness/diet-plans",
    });
    expect(TRAINER_NAV_ITEMS[5]).toMatchObject({
      title: "Progress & Measurements",
      href: "/fitness/progress",
    });
    expect(TRAINER_NAV_ITEMS[6]).toMatchObject({
      title: "Notifications",
      href: "/notifications",
    });
    expect(TRAINER_NAV_ITEMS[7]).toMatchObject({
      title: "My Profile",
      href: "/settings/profile",
    });
  });

  it("exports a single TRAINER_NAV_SECTION containing all 8 items", () => {
    expect(TRAINER_NAV_SECTION.title).toBe("Trainer Portal");
    expect(TRAINER_NAV_SECTION.items).toEqual(TRAINER_NAV_ITEMS);
  });

  it("preserves Owner and Admin navigation sections intact", () => {
    const titles = NAV_SECTIONS.map((s) => s.title);
    expect(titles).toContain("Members");
    expect(titles).toContain("Billing");
    expect(titles).toContain("Trainers");
    expect(titles).toContain("Fitness");
    expect(titles).toContain("Settings");

    const allHrefs = FLAT_NAV_ITEMS.map((item) => item.href);
    expect(allHrefs).toContain("/billing");
    expect(allHrefs).toContain("/reports");
    expect(allHrefs).toContain("/trainers");
  });

  it("renders Trainer Portal branding in the sidebar for trainer role", () => {
    expect(sidebar).toContain("Trainer Portal ·");
    expect(sidebar).toContain("Role: Trainer");
    expect(sidebar).toContain("TRAINER_NAV_SECTION");
    expect(sidebar).toContain('hasRole(["trainer"])');
  });
});

describe("Trainer Portal — Database Authorization Migration", () => {
  it("authorizes trainers to create PT sessions for actively assigned members only", () => {
    expect(migration).toContain("create or replace function public.create_pt_session");
    expect(migration).toContain("public.linked_trainer_id(p_org_id) is not distinct from p_trainer_id");
    expect(migration).toContain("public.can_view_member_data(p_org_id, p_member_id)");
  });

  it("authorizes trainers to update PT sessions for their own assigned sessions", () => {
    expect(migration).toContain("create or replace function public.update_pt_session");
    expect(migration).toContain("public.linked_trainer_id(v_org_id) is not distinct from v_trainer");
    expect(migration).toContain("public.can_view_member_data(v_org_id, p_member_id)");
  });

  it("enforces can_view_member_data on workout and diet plan creation and updates", () => {
    expect(migration).toContain("create or replace function public.create_workout_plan");
    expect(migration).toContain("create or replace function public.update_workout_plan");
    expect(migration).toContain("create or replace function public.create_diet_plan");
    expect(migration).toContain("create or replace function public.update_diet_plan");
    expect(migration).toContain("not public.can_view_member_data(p_org_id, p_member_id)");
    expect(migration).toContain("not public.can_view_member_data(v_org_id, p_member_id)");
  });

  it("enforces can_view_member_data on body measurements and progress entries", () => {
    expect(migration).toContain("create or replace function public.create_body_measurement");
    expect(migration).toContain("create or replace function public.update_body_measurement");
    expect(migration).toContain("create or replace function public.create_progress_entry");
    expect(migration).toContain("create or replace function public.update_progress_entry");
  });

  it("is recorded in COMBINE.sql without dropping tables or disabling RLS", () => {
    expect(combine).toContain("20261123000039_trainer_portal_authorization.sql");
    expect(migration).not.toMatch(/drop table/i);
    expect(migration).not.toMatch(/disable row level security/i);
  });
});

describe("Trainer Portal — Dashboard Scoping", () => {
  it("displays real KPI counts and greeting in TrainerHome", () => {
    expect(roleHome).toContain("{greeting}, {firstName}");
    expect(roleHome).toContain("My Members");
    expect(roleHome).toContain("Today&apos;s Sessions");
    expect(roleHome).toContain("Upcoming Sessions");
    expect(roleHome).toContain("Pending Logs");
  });

  it("provides quick action shortcuts for trainer workflows", () => {
    expect(roleHome).toContain("/trainers/pt-sessions/add");
    expect(roleHome).toContain("/fitness/workout-plans/add");
    expect(roleHome).toContain("/fitness/diet-plans/add");
    expect(roleHome).toContain("/fitness/progress");
  });
});

describe("Trainer Portal — Members List & Detail Scoping", () => {
  it("limits trainer row actions to permitted items only and omits billing/memberships", () => {
    expect(membersList).toContain("if (isTrainer)");
    expect(membersList).toContain("Schedule PT");
    expect(membersList).toContain("Workout plan");
    expect(membersList).toContain("Diet plan");
    expect(membersList).toContain("Progress & measurements");
    expect(membersList).toContain("!isTrainer && (");
  });

  it("denies unassigned member access in MemberDetail", () => {
    expect(memberDetail).toContain("result.data.assignedTrainerId !== linked.data");
    expect(memberDetail).toContain(
      "You are only permitted to view members actively assigned to your training schedule.",
    );
  });

  it("hides billing, classes, activity tabs and login link panel for trainers in MemberDetail", () => {
    expect(memberDetail).toContain("isTrainer\n            ? [");
    expect(memberDetail).toContain("<MemberLoginLinkPanel");
    expect(memberDetail).toContain("!isTrainer && (");
  });
});

describe("Trainer Portal — Progress & Measurements Combined Screen", () => {
  it("verifies assigned member access and denies unauthorized member URLs", () => {
    expect(progressScreen).toContain("Progress & Measurements");
    expect(progressScreen).toContain("fetchTrainerAssignedMembers");
    expect(progressScreen).toContain("setUnauthorized(true)");
    expect(progressScreen).toContain(
      "You are only permitted to view progress and measurements for members actively assigned to your training schedule.",
    );
  });

  it("renders trend metrics, measurements history, and progress logs", () => {
    expect(progressScreen).toContain("Current Weight");
    expect(progressScreen).toContain("Net Weight Change");
    expect(progressScreen).toContain("Body Fat %");
    expect(progressScreen).toContain("Body Measurements");
    expect(progressScreen).toContain("Progress Entries");
  });
});

describe("Trainer Portal — Profile & Secure Credentials", () => {
  it("displays read-only Trainer Code, Branch, and Role with change password flow", () => {
    expect(profileForm).toContain("Trainer details");
    expect(profileForm).toContain("Trainer Code");
    expect(profileForm).toContain("Role");
    expect(profileForm).toContain("/change-password");
    expect(profileForm).toContain("fetchLinkedTrainerProfile");
  });
});
