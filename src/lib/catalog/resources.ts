/**
 * Catalog ResourceConfig declarations (Phase 3.2a).
 *
 * Each screen is a config consumed by the shared CRUD engine. Writes still go
 * through SECURITY DEFINER RPCs; these configs never talk to Supabase.
 */

import {
  Activity,
  CalendarDays,
  Dumbbell,
  Factory,
  Layers,
  Package,
  Percent,
} from "lucide-react";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fromZod } from "@/lib/crud/validate";
import type { ResourceConfig } from "@/lib/crud/types";
import {
  classTemplateAdapter,
  exerciseAdapter,
  gstRateAdapter,
  loadTrainerOptions,
  membershipPlanAdapter,
  productAdapter,
  supplierAdapter,
  trainerAdapter,
  type ClassTemplateRow,
  type ExerciseRow,
  type GstRateRow,
  type MembershipPlanRow,
  type ProductRow,
  type SupplierRow,
  type TrainerRow,
} from "@/lib/catalog/adapters";
import {
  EXERCISE_DIFFICULTIES,
  classTemplateFormSchema,
  exerciseFormSchema,
  gstRateFormSchema,
  membershipPlanFormSchema,
  productFormSchema,
  supplierFormSchema,
  trainerFormSchema,
} from "@/lib/validation/catalog-schemas";

const ACTIVE_FILTER = [
  { value: "true", label: "Active" },
  { value: "false", label: "Inactive" },
] as const;

const booleanStatus = {
  field: "isActive",
  fromRow: (row: { isActive: boolean }) => row.isActive,
};

export const trainerResource: ResourceConfig<TrainerRow> = {
  key: "trainers",
  title: "Trainers",
  singular: "trainer",
  description: "Trainer profiles used for assignments, PT sessions and classes.",
  icon: Dumbbell,
  routeBase: "/trainers",
  permissions: {
    view: PERMISSIONS.trainers.view,
    create: PERMISSIONS.trainers.create,
    update: PERMISSIONS.trainers.edit,
  },
  searchPlaceholder: "Search trainers by name, code, email or phone",
  emptyDescription: "Add your first trainer to assign members and classes.",
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ],
  status: {
    field: "status",
    fromRow: (row) => row.status === "active",
  },
  columns: [
    { id: "name", header: "Name", accessor: (row) => row.fullName },
    { id: "code", header: "Code", accessor: (row) => row.code, format: "code" },
    { id: "specialization", header: "Specialization", accessor: (row) => row.specialization, format: "muted" },
    { id: "phone", header: "Phone", accessor: (row) => row.phone, format: "muted" },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
    { id: "rate", header: "Hourly rate", accessor: (row) => row.hourlyRate, format: "currency", align: "right" },
  ],
  fields: [
    {
      title: "Profile",
      columns: 2,
      fields: [
        { name: "firstName", label: "First name", required: true, autoComplete: "given-name" },
        { name: "lastName", label: "Last name", required: true, autoComplete: "family-name" },
        { name: "code", label: "Trainer code", placeholder: "Optional unique code" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
        { name: "specialization", label: "Specialization", placeholder: "e.g. Strength, Yoga" },
        {
          name: "branchId",
          label: "Home branch",
          type: "select",
          optionsSource: "branches",
          placeholder: "Any branch",
        },
        { name: "hourlyRate", label: "Hourly rate", type: "number", min: 0, step: 0.01, prefix: "₹" },
        { name: "joinedAt", label: "Joined on", type: "date" },
        { name: "bio", label: "Bio", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(trainerFormSchema),
  adapter: trainerAdapter,
  displayName: (row) => row.fullName,
};

export const membershipPlanResource: ResourceConfig<MembershipPlanRow> = {
  key: "membership_plans",
  title: "Membership plans",
  singular: "plan",
  description: "Master data for membership plans. Pricing here is catalog only — invoices stay in Billing.",
  icon: Layers,
  routeBase: "/memberships/plans",
  permissions: {
    view: PERMISSIONS.memberships.view,
    create: PERMISSIONS.memberships.create,
    update: PERMISSIONS.memberships.update,
  },
  searchPlaceholder: "Search plans by name or code",
  emptyDescription: "Add a membership plan to start selling memberships.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Plan", accessor: (row) => row.name },
    { id: "code", header: "Code", accessor: (row) => row.code, format: "code" },
    { id: "duration", header: "Duration", accessor: (row) => `${row.durationDays} days`, format: "muted" },
    { id: "price", header: "Price", accessor: (row) => row.price, format: "currency", align: "right" },
    { id: "signup", header: "Signup fee", accessor: (row) => row.signupFee, format: "currency", align: "right" },
  ],
  fields: [
    {
      title: "Plan details",
      columns: 2,
      fields: [
        { name: "name", label: "Plan name", required: true },
        { name: "code", label: "Plan code", required: true, placeholder: "e.g. GOLD-12" },
        { name: "description", label: "Description", type: "textarea", rows: 3, span: 2 },
        { name: "durationDays", label: "Duration (days)", type: "number", required: true, min: 1, step: 1 },
        { name: "maxFreezeDays", label: "Max freeze days", type: "number", required: true, min: 0, step: 1 },
        { name: "price", label: "Price", type: "number", required: true, min: 0, step: 0.01, prefix: "₹", hint: "Catalog price. Do not collect payment on this screen." },
        { name: "signupFee", label: "Signup fee", type: "number", required: true, min: 0, step: 0.01, prefix: "₹" },
        { name: "taxRate", label: "Tax rate", type: "number", required: true, min: 0, step: 0.01, suffix: "%" },
        { name: "sortOrder", label: "Sort order", type: "number", required: true, step: 1, defaultValue: "0" },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(membershipPlanFormSchema),
  adapter: membershipPlanAdapter,
  displayName: (row) => row.name,
  billingHandoff: "assign",
};

export const gstRateResource: ResourceConfig<GstRateRow> = {
  key: "gst_rates",
  title: "GST master",
  singular: "GST rate",
  description: "GST rates used on invoices, memberships and POS sales.",
  icon: Percent,
  routeBase: "/billing/gst-master",
  permissions: {
    view: PERMISSIONS.gst.view,
    create: PERMISSIONS.gst.manage,
    update: PERMISSIONS.gst.manage,
  },
  searchPlaceholder: "Search GST rates by name or HSN/SAC",
  emptyDescription: "Add a GST rate to apply tax on invoices and sales.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Name", accessor: (row) => row.name },
    { id: "rate", header: "Rate", accessor: (row) => `${row.rate}%`, align: "right" },
    { id: "hsn", header: "HSN / SAC", accessor: (row) => row.hsnSac, format: "code" },
    { id: "default", header: "Default", accessor: (row) => row.isDefault, format: "boolean" },
  ],
  fields: [
    {
      title: "GST rate",
      columns: 2,
      fields: [
        { name: "name", label: "Name", required: true, placeholder: "e.g. GST 18%" },
        { name: "rate", label: "Rate", type: "number", required: true, min: 0, step: 0.01, suffix: "%" },
        { name: "hsnSac", label: "HSN / SAC", placeholder: "Optional code" },
        { name: "isDefault", label: "Default rate", type: "checkbox", defaultValue: false, hint: "Only one rate can be the default." },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(gstRateFormSchema),
  adapter: gstRateAdapter,
  displayName: (row) => row.name,
};

export const exerciseResource: ResourceConfig<ExerciseRow> = {
  key: "exercises",
  title: "Exercises",
  singular: "exercise",
  description: "Exercise library used in workout plans.",
  icon: Activity,
  routeBase: "/fitness/exercises",
  permissions: {
    view: PERMISSIONS.fitness.view,
    create: PERMISSIONS.fitness.manage,
    update: PERMISSIONS.fitness.manage,
  },
  searchPlaceholder: "Search exercises by name, category or muscle group",
  emptyDescription: "Add exercises to build workout plans.",
  filters: [
    { name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER },
    {
      name: "difficulty",
      label: "Difficulty",
      allLabel: "All difficulties",
      options: EXERCISE_DIFFICULTIES.filter((option) => option.value !== ""),
    },
  ],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Exercise", accessor: (row) => row.name },
    { id: "category", header: "Category", accessor: (row) => row.category, format: "muted" },
    { id: "muscle", header: "Muscle group", accessor: (row) => row.muscleGroup, format: "muted" },
    { id: "difficulty", header: "Difficulty", accessor: (row) => row.difficulty, format: "muted" },
  ],
  fields: [
    {
      title: "Exercise",
      columns: 2,
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "category", label: "Category", placeholder: "e.g. Strength, Cardio" },
        { name: "muscleGroup", label: "Muscle group", placeholder: "e.g. Chest, Legs" },
        { name: "equipment", label: "Equipment", placeholder: "e.g. Barbell, Bodyweight" },
        {
          name: "difficulty",
          label: "Difficulty",
          type: "select",
          options: EXERCISE_DIFFICULTIES,
          placeholder: "Select difficulty",
        },
        { name: "videoUrl", label: "Video URL", type: "url", placeholder: "https://" },
        { name: "instructions", label: "Instructions", type: "textarea", rows: 4, span: 2 },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(exerciseFormSchema),
  adapter: exerciseAdapter,
  displayName: (row) => row.name,
};

export const classTemplateResource: ResourceConfig<ClassTemplateRow> = {
  key: "class_templates",
  title: "Class schedule",
  singular: "class",
  description: "Reusable class templates for the timetable.",
  icon: CalendarDays,
  routeBase: "/classes/schedule",
  permissions: {
    view: PERMISSIONS.classes.view,
    create: PERMISSIONS.classes.manage,
    update: PERMISSIONS.classes.manage,
  },
  searchPlaceholder: "Search classes by name",
  emptyDescription: "Add a class template to start scheduling sessions.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Class", accessor: (row) => row.name },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
    { id: "trainer", header: "Trainer", accessor: (row) => row.trainerName, format: "muted" },
    { id: "duration", header: "Duration", accessor: (row) => `${row.durationMinutes} min`, format: "muted" },
    { id: "capacity", header: "Capacity", accessor: (row) => row.capacity, format: "number", align: "right" },
  ],
  fields: [
    {
      title: "Class template",
      columns: 2,
      fields: [
        { name: "name", label: "Class name", required: true },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          required: true,
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        {
          name: "trainerId",
          label: "Default trainer",
          type: "select",
          placeholder: "Unassigned",
          loadOptions: ({ organizationId }) => loadTrainerOptions(organizationId),
        },
        { name: "durationMinutes", label: "Duration (minutes)", type: "number", required: true, min: 1, step: 1, defaultValue: "60" },
        { name: "capacity", label: "Capacity", type: "number", required: true, min: 0, step: 1, defaultValue: "0" },
        { name: "description", label: "Description", type: "textarea", rows: 3, span: 2 },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(classTemplateFormSchema),
  adapter: classTemplateAdapter,
  displayName: (row) => row.name,
};

export const productResource: ResourceConfig<ProductRow> = {
  key: "products",
  title: "Products",
  singular: "product",
  description: "Products sold at the gym or used in POS.",
  icon: Package,
  routeBase: "/inventory/products",
  permissions: {
    view: PERMISSIONS.inventory.view,
    create: PERMISSIONS.inventory.manage,
    update: PERMISSIONS.inventory.manage,
  },
  searchPlaceholder: "Search products by name, SKU or category",
  emptyDescription: "Add products to sell at the front desk.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Product", accessor: (row) => row.name },
    { id: "sku", header: "SKU", accessor: (row) => row.sku, format: "code" },
    { id: "category", header: "Category", accessor: (row) => row.category, format: "muted" },
    { id: "sale", header: "Sale price", accessor: (row) => row.salePrice, format: "currency", align: "right" },
    { id: "stock", header: "Stock", accessor: (row) => (row.trackStock ? row.stockQuantity : "—"), align: "right" },
  ],
  fields: [
    {
      title: "Product",
      columns: 2,
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "sku", label: "SKU", placeholder: "Optional unique SKU" },
        { name: "category", label: "Category", placeholder: "e.g. Supplements" },
        { name: "unit", label: "Unit", required: true, defaultValue: "pcs" },
        { name: "description", label: "Description", type: "textarea", rows: 3, span: 2 },
      ],
    },
    {
      title: "Pricing & stock",
      columns: 2,
      fields: [
        { name: "costPrice", label: "Cost price", type: "number", required: true, min: 0, step: 0.01, prefix: "₹", defaultValue: "0" },
        { name: "salePrice", label: "Sale price", type: "number", required: true, min: 0, step: 0.01, prefix: "₹", defaultValue: "0" },
        { name: "taxRate", label: "Tax rate", type: "number", required: true, min: 0, step: 0.01, suffix: "%", defaultValue: "0" },
        { name: "trackStock", label: "Track stock", type: "checkbox", defaultValue: true },
        { name: "stockQuantity", label: "Stock quantity", type: "number", required: true, min: 0, step: 0.001, defaultValue: "0" },
        { name: "reorderLevel", label: "Reorder level", type: "number", required: true, min: 0, step: 0.001, defaultValue: "0" },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
      ],
    },
  ],
  validate: fromZod(productFormSchema),
  adapter: productAdapter,
  displayName: (row) => row.name,
};

export const supplierResource: ResourceConfig<SupplierRow> = {
  key: "suppliers",
  title: "Suppliers",
  singular: "supplier",
  description: "Supplier records used for purchases.",
  icon: Factory,
  routeBase: "/inventory/suppliers",
  permissions: {
    view: PERMISSIONS.inventory.view,
    create: PERMISSIONS.inventory.manage,
    update: PERMISSIONS.inventory.manage,
  },
  searchPlaceholder: "Search suppliers by name, contact, email or GSTIN",
  emptyDescription: "Add a supplier to record purchases.",
  filters: [{ name: "isActive", label: "Status", allLabel: "All statuses", options: ACTIVE_FILTER }],
  status: booleanStatus,
  columns: [
    { id: "name", header: "Supplier", accessor: (row) => row.name },
    { id: "contact", header: "Contact", accessor: (row) => row.contactName, format: "muted" },
    { id: "phone", header: "Phone", accessor: (row) => row.phone, format: "muted" },
    { id: "email", header: "Email", accessor: (row) => row.email, format: "muted" },
    { id: "gstin", header: "GSTIN", accessor: (row) => row.gstin, format: "code" },
  ],
  fields: [
    {
      title: "Supplier",
      columns: 2,
      fields: [
        { name: "name", label: "Name", required: true },
        { name: "contactName", label: "Contact name" },
        { name: "email", label: "Email", type: "email" },
        { name: "phone", label: "Phone", type: "tel" },
        { name: "gstin", label: "GSTIN" },
        { name: "isActive", label: "Active", type: "checkbox", defaultValue: true },
        { name: "notes", label: "Notes", type: "textarea", rows: 3, span: 2 },
      ],
    },
    {
      title: "Address",
      columns: 2,
      fields: [
        { name: "addressLine1", label: "Address line 1" },
        { name: "addressLine2", label: "Address line 2" },
        { name: "city", label: "City" },
        { name: "state", label: "State" },
        { name: "postalCode", label: "Postal code" },
        { name: "country", label: "Country" },
      ],
    },
  ],
  validate: fromZod(supplierFormSchema),
  adapter: supplierAdapter,
  displayName: (row) => row.name,
};

export const CATALOG_RESOURCES = {
  trainers: trainerResource,
  membership_plans: membershipPlanResource,
  gst_rates: gstRateResource,
  exercises: exerciseResource,
  class_templates: classTemplateResource,
  products: productResource,
  suppliers: supplierResource,
} as const;

export type CatalogResourceKey = keyof typeof CATALOG_RESOURCES;
