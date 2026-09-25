/**
 * Operations ResourceConfig declarations (Phase 3.2b).
 *
 * Each screen is a config consumed by the shared CRUD engine. Writes still go
 * through SECURITY DEFINER RPCs; these configs never talk to Supabase.
 */

import {
  Activity,
  BadgeCheck,
  CalendarCheck,
  ClipboardList,
  HeartPulse,
  Hourglass,
  RefreshCcw,
  Ruler,
  Salad,
  Snowflake,
  UserCheck,
} from "lucide-react";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fromZod } from "@/lib/crud/validate";
import type { ResourceConfig } from "@/lib/crud/types";
import { loadTrainerOptions } from "@/lib/catalog/adapters";
import {
  activeMembershipAdapter,
  attendanceAdapter,
  bodyMeasurementAdapter,
  classBookingAdapter,
  dietPlanAdapter,
  loadClassTemplateOptions,
  loadMemberOptions,
  loadMembershipOptions,
  loadPlanOptions,
  membershipFreezeAdapter,
  progressEntryAdapter,
  ptSessionAdapter,
  renewalMembershipAdapter,
  trainerAssignmentAdapter,
  waitlistBookingAdapter,
  workoutPlanAdapter,
  type AttendanceRow,
  type BodyMeasurementRow,
  type ClassBookingRow,
  type DietPlanRow,
  type MembershipFreezeRow,
  type MembershipRow,
  type ProgressEntryRow,
  type PtSessionRow,
  type TrainerAssignmentRow,
  type WorkoutPlanRow,
} from "@/lib/operations/adapters";
import {
  ATTENDANCE_METHODS,
  BOOKING_STATUSES,
  PT_SESSION_STATUSES,
  attendanceFormSchema,
  bodyMeasurementFormSchema,
  classBookingFormSchema,
  dietPlanFormSchema,
  membershipFormSchema,
  membershipFreezeFormSchema,
  progressEntryFormSchema,
  ptSessionFormSchema,
  trainerAssignmentFormSchema,
  workoutPlanFormSchema,
} from "@/lib/validation/operations-schemas";

const ACTIVE_FILTER = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
] as const;

const booleanStatus = {
  field: "isActive",
  fromRow: (row: { isActive: boolean }) => row.isActive,
};

const membershipColumns = [
  { id: "member", header: "Member", accessor: (row: MembershipRow) => row.memberName },
  { id: "plan", header: "Plan", accessor: (row: MembershipRow) => row.planName, format: "muted" as const },
  { id: "branch", header: "Branch", accessor: (row: MembershipRow) => row.branchName, format: "muted" as const },
  { id: "start", header: "Start", accessor: (row: MembershipRow) => row.startDate, format: "date" as const },
  { id: "end", header: "End", accessor: (row: MembershipRow) => row.endDate, format: "date" as const },
  { id: "amount", header: "Amount", accessor: (row: MembershipRow) => row.finalAmount, format: "currency" as const, align: "right" as const },
];

const membershipFields = [
  {
    title: "Membership",
    columns: 2 as const,
    fields: [
      {
        name: "memberId",
        label: "Member",
        type: "select" as const,
        required: true,
        placeholder: "Select a member",
        loadOptions: ({ organizationId }: { organizationId: string }) => loadMemberOptions(organizationId),
      },
      {
        name: "planId",
        label: "Plan",
        type: "select" as const,
        required: true,
        placeholder: "Select a plan",
        loadOptions: ({ organizationId }: { organizationId: string }) => loadPlanOptions(organizationId),
      },
      {
        name: "branchId",
        label: "Branch",
        type: "select" as const,
        required: true,
        optionsSource: "branches" as const,
        placeholder: "Select a branch",
      },
      { name: "startDate", label: "Start date", type: "date" as const },
      { name: "endDate", label: "End date", type: "date" as const, hint: "Leave blank to use the plan duration." },
      {
        name: "price",
        label: "Price",
        type: "number" as const,
        min: 0,
        step: 0.01,
        prefix: "₹",
        hint: "Leave blank to use the plan price. Payment is collected in Billing.",
      },
      { name: "discount", label: "Discount", type: "number" as const, min: 0, step: 0.01, prefix: "₹", defaultValue: "0" },
      { name: "notes", label: "Notes", type: "textarea" as const, rows: 3, span: 2 as const },
    ],
  },
];

const membershipPermissions = {
  view: PERMISSIONS.memberships.view,
  create: PERMISSIONS.memberships.create,
  update: PERMISSIONS.memberships.update,
};

const membershipRowActions = (row: MembershipRow) => [
  ...(row.status === "active"
    ? [{ label: "Freeze", href: `/memberships/freeze-extend/add?membershipId=${row.id}` }]
    : []),
  { label: "Change trainer", href: `/trainers/assignments/add?memberId=${row.memberId}` },
];

export const activeMembershipResource: ResourceConfig<MembershipRow> = {
  key: "memberships_active",
  title: "Active memberships",
  singular: "membership",
  description: "Currently active memberships across your branches.",
  icon: BadgeCheck,
  routeBase: "/memberships/active",
  permissions: membershipPermissions,
  searchPlaceholder: "Search membership notes",
  emptyDescription: "Assign a membership plan to a member to see it listed here.",
  columns: membershipColumns,
  fields: membershipFields,
  validate: fromZod(membershipFormSchema),
  adapter: activeMembershipAdapter,
  displayName: (row) => `${row.memberName} — ${row.planName}`,
  createLabel: "Assign membership",
  billingHandoff: "assign",
  extraRowActions: membershipRowActions,
};

export const renewalMembershipResource: ResourceConfig<MembershipRow> = {
  key: "memberships_renewals",
  title: "Renewals",
  singular: "membership",
  description: "Active memberships ending within the next 30 days.",
  icon: RefreshCcw,
  routeBase: "/memberships/renewals",
  permissions: membershipPermissions,
  searchPlaceholder: "Search membership notes",
  emptyDescription: "No memberships are due for renewal in the next 30 days.",
  columns: membershipColumns,
  fields: membershipFields,
  validate: fromZod(membershipFormSchema),
  adapter: renewalMembershipAdapter,
  displayName: (row) => `${row.memberName} — ${row.planName}`,
  hideCreate: true,
  billingHandoff: "renew",
  extraRowActions: membershipRowActions,
};

export const expiringMembershipResource: ResourceConfig<MembershipRow> = {
  ...renewalMembershipResource,
  key: "memberships_expiring",
  title: "Expiring",
  description: "Memberships nearing their end date.",
  icon: Hourglass,
  routeBase: "/members/expiring",
  hideCreate: true,
};

export const membershipFreezeResource: ResourceConfig<MembershipFreezeRow> = {
  key: "membership_freezes",
  title: "Freeze / extend",
  singular: "freeze",
  description: "Freeze an active membership. The end date is extended by the freeze duration. This does not change member status.",
  icon: Snowflake,
  routeBase: "/memberships/freeze-extend",
  permissions: {
    view: PERMISSIONS.memberships.view,
    create: PERMISSIONS.memberships.freeze,
  },
  searchPlaceholder: "Search freeze reasons",
  emptyDescription: "Freeze an active membership to pause and extend it.",
  createLabel: "Record freeze",
  billingHandoff: "freeze",
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "plan", header: "Plan", accessor: (row) => row.planName, format: "muted" },
    { id: "start", header: "Start", accessor: (row) => row.startDate, format: "date" },
    { id: "end", header: "End", accessor: (row) => row.endDate, format: "date" },
    { id: "days", header: "Days", accessor: (row) => row.days, format: "number", align: "right" },
    { id: "reason", header: "Reason", accessor: (row) => row.reason, format: "muted" },
  ],
  fields: [
    {
      title: "Freeze",
      columns: 2,
      fields: [
        {
          name: "membershipId",
          label: "Membership",
          type: "select",
          required: true,
          placeholder: "Select an active membership",
          loadOptions: ({ organizationId }) => loadMembershipOptions(organizationId),
          span: 2,
        },
        { name: "startDate", label: "Start date", type: "date", required: true },
        { name: "endDate", label: "End date", type: "date", required: true },
        { name: "reason", label: "Reason", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(membershipFreezeFormSchema),
  adapter: membershipFreezeAdapter,
  displayName: (row) => `${row.memberName} freeze`,
};

export const attendanceResource: ResourceConfig<AttendanceRow> = {
  key: "attendance_records",
  title: "Attendance",
  singular: "check-in",
  description: "Member check-ins across branches.",
  icon: ClipboardList,
  routeBase: "/attendance",
  permissions: {
    view: PERMISSIONS.attendance.view,
    create: PERMISSIONS.attendance.create,
    update: PERMISSIONS.attendance.manage,
  },
  searchPlaceholder: "Search attendance notes or method",
  emptyDescription: "Record a check-in to start tracking attendance.",
  filters: [
    {
      name: "method",
      label: "Method",
      allLabel: "All methods",
      options: ATTENDANCE_METHODS,
    },
  ],
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
    { id: "in", header: "Check-in", accessor: (row) => row.checkInAt, format: "datetime" },
    { id: "out", header: "Check-out", accessor: (row) => row.checkOutAt, format: "datetime" },
    { id: "method", header: "Method", accessor: (row) => row.method, format: "muted" },
  ],
  fields: [
    {
      title: "Check-in",
      columns: 2,
      fields: [
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          required: true,
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        { name: "checkInAt", label: "Check-in", type: "datetime", hint: "Leave blank to use the current time." },
        { name: "checkOutAt", label: "Check-out", type: "datetime" },
        {
          name: "method",
          label: "Method",
          type: "select",
          required: true,
          options: ATTENDANCE_METHODS,
          defaultValue: "manual",
        },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(attendanceFormSchema),
  adapter: attendanceAdapter,
  displayName: (row) => row.memberName,
};

export const trainerAssignmentResource: ResourceConfig<TrainerAssignmentRow> = {
  key: "trainer_assignments",
  title: "Assignments",
  singular: "assignment",
  description: "Assign trainers to members. A member can have one active trainer.",
  icon: UserCheck,
  routeBase: "/trainers/assignments",
  permissions: {
    view: PERMISSIONS.trainers.view,
    create: PERMISSIONS.trainers.assign,
    update: PERMISSIONS.trainers.reassign,
  },
  searchPlaceholder: "Search assignment notes",
  emptyDescription: "Assign a trainer to a member to get started.",
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: [
        { value: "active", label: "Active" },
        { value: "ended", label: "Ended" },
      ],
    },
  ],
  status: {
    field: "status",
    fromRow: (row) => row.status === "active",
    activeLabel: "Active",
    inactiveLabel: "Ended",
  },
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "trainer", header: "Trainer", accessor: (row) => row.trainerName, format: "muted" },
    { id: "assigned", header: "Assigned", accessor: (row) => row.assignedAt, format: "date" },
  ],
  fields: [
    {
      title: "Assignment",
      columns: 2,
      fields: [
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "trainerId",
          label: "Trainer",
          type: "select",
          required: true,
          placeholder: "Select a trainer",
          loadOptions: ({ organizationId }) => loadTrainerOptions(organizationId),
        },
        { name: "assignedAt", label: "Assigned on", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(trainerAssignmentFormSchema),
  adapter: trainerAssignmentAdapter,
  displayName: (row) => `${row.memberName} — ${row.trainerName}`,
};

export const ptSessionResource: ResourceConfig<PtSessionRow> = {
  key: "pt_sessions",
  title: "PT sessions",
  singular: "session",
  description: "Personal training sessions between trainers and members.",
  icon: CalendarCheck,
  routeBase: "/trainers/pt-sessions",
  permissions: {
    view: PERMISSIONS.trainers.view,
    create: PERMISSIONS.trainers.assign,
    update: PERMISSIONS.trainers.edit,
  },
  searchPlaceholder: "Search session notes",
  emptyDescription: "Schedule a PT session for a member.",
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: PT_SESSION_STATUSES,
    },
  ],
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "trainer", header: "Trainer", accessor: (row) => row.trainerName, format: "muted" },
    { id: "when", header: "Scheduled", accessor: (row) => row.scheduledAt, format: "datetime" },
    { id: "duration", header: "Duration", accessor: (row) => `${row.durationMinutes} min`, format: "muted" },
    { id: "status", header: "Status", accessor: (row) => row.status, format: "muted" },
  ],
  fields: [
    {
      title: "Session",
      columns: 2,
      fields: [
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "trainerId",
          label: "Trainer",
          type: "select",
          required: true,
          placeholder: "Select a trainer",
          loadOptions: ({ organizationId }) => loadTrainerOptions(organizationId),
        },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          required: true,
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        { name: "scheduledAt", label: "Scheduled at", type: "datetime", required: true },
        { name: "durationMinutes", label: "Duration (minutes)", type: "number", required: true, min: 1, step: 1, defaultValue: "60" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(ptSessionFormSchema),
  adapter: ptSessionAdapter,
  displayName: (row) => `${row.memberName} PT`,
};

const bookingFields = [
  {
    title: "Booking",
    columns: 2 as const,
    fields: [
      {
        name: "memberId",
        label: "Member",
        type: "select" as const,
        required: true,
        placeholder: "Select a member",
        loadOptions: ({ organizationId }: { organizationId: string }) => loadMemberOptions(organizationId),
      },
      {
        name: "classTemplateId",
        label: "Class",
        type: "select" as const,
        required: true,
        placeholder: "Select a class",
        loadOptions: ({ organizationId }: { organizationId: string }) =>
          loadClassTemplateOptions(organizationId),
      },
      {
        name: "branchId",
        label: "Branch",
        type: "select" as const,
        required: true,
        optionsSource: "branches" as const,
        placeholder: "Select a branch",
      },
      {
        name: "trainerId",
        label: "Trainer",
        type: "select" as const,
        placeholder: "Class default",
        loadOptions: ({ organizationId }: { organizationId: string }) => loadTrainerOptions(organizationId),
      },
      { name: "startsAt", label: "Starts at", type: "datetime" as const },
      { name: "endsAt", label: "Ends at", type: "datetime" as const },
      { name: "capacity", label: "Capacity", type: "number" as const, min: 0, step: 1 },
      {
        name: "status",
        label: "Status",
        type: "select" as const,
        required: true,
        options: BOOKING_STATUSES,
        defaultValue: "booked",
      },
      { name: "notes", label: "Notes", type: "textarea" as const, rows: 3, span: 2 as const },
    ],
  },
];

const bookingColumns = [
  { id: "member", header: "Member", accessor: (row: ClassBookingRow) => row.memberName },
  { id: "class", header: "Class", accessor: (row: ClassBookingRow) => row.className, format: "muted" as const },
  { id: "when", header: "Starts", accessor: (row: ClassBookingRow) => row.startsAt, format: "datetime" as const },
  { id: "trainer", header: "Trainer", accessor: (row: ClassBookingRow) => row.trainerName, format: "muted" as const },
  { id: "status", header: "Status", accessor: (row: ClassBookingRow) => row.status, format: "muted" as const },
];

export const classBookingResource: ResourceConfig<ClassBookingRow> = {
  key: "class_bookings",
  title: "Bookings",
  singular: "booking",
  description: "Book members into class sessions. A session is created when one is not supplied.",
  icon: CalendarCheck,
  routeBase: "/classes/bookings",
  permissions: {
    view: PERMISSIONS.classes.view,
    create: PERMISSIONS.bookings.manage,
    update: PERMISSIONS.bookings.manage,
  },
  searchPlaceholder: "Search booking notes",
  emptyDescription: "Book a member into a class to get started.",
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: BOOKING_STATUSES,
    },
  ],
  columns: bookingColumns,
  fields: bookingFields,
  validate: fromZod(classBookingFormSchema),
  adapter: classBookingAdapter,
  displayName: (row) => `${row.memberName} — ${row.className}`,
};

export const waitlistBookingResource: ResourceConfig<ClassBookingRow> = {
  key: "class_waitlist",
  title: "Waitlist",
  singular: "waitlist entry",
  description: "Members waiting for a spot in a class.",
  icon: Hourglass,
  routeBase: "/classes/waitlist",
  permissions: {
    view: PERMISSIONS.classes.view,
    create: PERMISSIONS.bookings.manage,
    update: PERMISSIONS.bookings.manage,
  },
  searchPlaceholder: "Search waitlist notes",
  emptyDescription: "Add a waitlisted booking when a class is full.",
  columns: bookingColumns,
  fields: [
    {
      ...bookingFields[0],
      fields: bookingFields[0].fields.map((field) =>
        field.name === "status" ? { ...field, defaultValue: "waitlisted" } : field,
      ),
    },
  ],
  validate: fromZod(classBookingFormSchema),
  adapter: waitlistBookingAdapter,
  displayName: (row) => `${row.memberName} — ${row.className}`,
};

export const workoutPlanResource: ResourceConfig<WorkoutPlanRow> = {
  key: "workout_plans",
  title: "Workout plans",
  singular: "workout plan",
  description: "Training plans assigned to members.",
  icon: Activity,
  routeBase: "/fitness/workout-plans",
  permissions: {
    view: PERMISSIONS.fitness.view,
    create: PERMISSIONS.fitness.manage,
    update: PERMISSIONS.fitness.manage,
  },
  searchPlaceholder: "Search workout plans by name or goal",
  emptyDescription: "Create a workout plan for a member.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Plan", accessor: (row) => row.name },
    { id: "member", header: "Member", accessor: (row) => row.memberName, format: "muted" },
    { id: "trainer", header: "Trainer", accessor: (row) => row.trainerName, format: "muted" },
    { id: "goal", header: "Goal", accessor: (row) => row.goal, format: "muted" },
    { id: "start", header: "Start", accessor: (row) => row.startDate, format: "date" },
  ],
  fields: [
    {
      title: "Workout plan",
      columns: 2,
      fields: [
        { name: "name", label: "Plan name", required: true },
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "trainerId",
          label: "Trainer",
          type: "select",
          placeholder: "Unassigned",
          loadOptions: ({ organizationId }) => loadTrainerOptions(organizationId),
        },
        { name: "goal", label: "Goal", placeholder: "e.g. Strength, fat loss" },
        { name: "startDate", label: "Start date", type: "date" },
        { name: "endDate", label: "End date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(workoutPlanFormSchema),
  adapter: workoutPlanAdapter,
  displayName: (row) => row.name,
};

export const dietPlanResource: ResourceConfig<DietPlanRow> = {
  key: "diet_plans",
  title: "Diet plans",
  singular: "diet plan",
  description: "Nutrition plans assigned to members.",
  icon: Salad,
  routeBase: "/fitness/diet-plans",
  permissions: {
    view: PERMISSIONS.fitness.view,
    create: PERMISSIONS.fitness.manage,
    update: PERMISSIONS.fitness.manage,
  },
  searchPlaceholder: "Search diet plans by name",
  emptyDescription: "Create a diet plan for a member.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Plan", accessor: (row) => row.name },
    { id: "member", header: "Member", accessor: (row) => row.memberName, format: "muted" },
    { id: "trainer", header: "Trainer", accessor: (row) => row.trainerName, format: "muted" },
    { id: "start", header: "Start", accessor: (row) => row.startDate, format: "date" },
    { id: "end", header: "End", accessor: (row) => row.endDate, format: "date" },
  ],
  fields: [
    {
      title: "Diet plan",
      columns: 2,
      fields: [
        { name: "name", label: "Plan name", required: true },
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "trainerId",
          label: "Trainer",
          type: "select",
          placeholder: "Unassigned",
          loadOptions: ({ organizationId }) => loadTrainerOptions(organizationId),
        },
        { name: "startDate", label: "Start date", type: "date" },
        { name: "endDate", label: "End date", type: "date" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(dietPlanFormSchema),
  adapter: dietPlanAdapter,
  displayName: (row) => row.name,
};

export const bodyMeasurementResource: ResourceConfig<BodyMeasurementRow> = {
  key: "body_measurements",
  title: "Measurements",
  singular: "measurement",
  description: "Body measurements tracked for members.",
  icon: Ruler,
  routeBase: "/fitness/measurements",
  permissions: {
    view: PERMISSIONS.fitness.view,
    create: PERMISSIONS.fitness.manage,
    update: PERMISSIONS.fitness.manage,
  },
  searchPlaceholder: "Search measurement notes",
  emptyDescription: "Record a member's measurements to track progress.",
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "date", header: "Measured", accessor: (row) => row.measuredAt, format: "date" },
    { id: "weight", header: "Weight (kg)", accessor: (row) => row.weightKg, format: "number", align: "right" },
    { id: "bodyfat", header: "Body fat %", accessor: (row) => row.bodyFatPercent, format: "number", align: "right" },
    { id: "waist", header: "Waist (cm)", accessor: (row) => row.waistCm, format: "number", align: "right" },
  ],
  fields: [
    {
      title: "Measurement",
      columns: 2,
      fields: [
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        { name: "measuredAt", label: "Measured on", type: "date" },
        { name: "weightKg", label: "Weight", type: "number", min: 0, step: 0.1, suffix: "kg" },
        { name: "heightCm", label: "Height", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "bodyFatPercent", label: "Body fat", type: "number", min: 0, step: 0.1, suffix: "%" },
        { name: "chestCm", label: "Chest", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "waistCm", label: "Waist", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "hipsCm", label: "Hips", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "armsCm", label: "Arms", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "thighsCm", label: "Thighs", type: "number", min: 0, step: 0.1, suffix: "cm" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(bodyMeasurementFormSchema),
  adapter: bodyMeasurementAdapter,
  displayName: (row) => `${row.memberName} measurement`,
};

export const progressEntryResource: ResourceConfig<ProgressEntryRow> = {
  key: "progress_entries",
  title: "Progress",
  singular: "progress entry",
  description: "Progress photos and weight entries for members.",
  icon: HeartPulse,
  routeBase: "/fitness/progress",
  permissions: {
    view: PERMISSIONS.fitness.view,
    create: PERMISSIONS.fitness.manage,
    update: PERMISSIONS.fitness.manage,
  },
  searchPlaceholder: "Search progress notes",
  emptyDescription: "Log a progress entry for a member.",
  columns: [
    { id: "member", header: "Member", accessor: (row) => row.memberName },
    { id: "date", header: "Date", accessor: (row) => row.entryDate, format: "date" },
    { id: "weight", header: "Weight (kg)", accessor: (row) => row.weightKg, format: "number", align: "right" },
    { id: "notes", header: "Notes", accessor: (row) => row.notes, format: "muted" },
  ],
  fields: [
    {
      title: "Progress entry",
      columns: 2,
      fields: [
        {
          name: "memberId",
          label: "Member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        { name: "entryDate", label: "Date", type: "date" },
        { name: "weightKg", label: "Weight", type: "number", min: 0, step: 0.1, suffix: "kg" },
        { name: "photoUrl", label: "Photo URL", type: "url", placeholder: "https://" },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
  ],
  validate: fromZod(progressEntryFormSchema),
  adapter: progressEntryAdapter,
  displayName: (row) => `${row.memberName} progress`,
};

export const OPERATIONS_RESOURCES = {
  memberships_active: activeMembershipResource,
  memberships_renewals: renewalMembershipResource,
  memberships_expiring: expiringMembershipResource,
  membership_freezes: membershipFreezeResource,
  attendance_records: attendanceResource,
  trainer_assignments: trainerAssignmentResource,
  pt_sessions: ptSessionResource,
  class_bookings: classBookingResource,
  class_waitlist: waitlistBookingResource,
  workout_plans: workoutPlanResource,
  diet_plans: dietPlanResource,
  body_measurements: bodyMeasurementResource,
  progress_entries: progressEntryResource,
} as const;

export type OperationsResourceKey = keyof typeof OPERATIONS_RESOURCES;
