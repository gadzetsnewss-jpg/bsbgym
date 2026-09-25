/**
 * Catalog-module table adapters (Phase 3.2a).
 *
 * Reads go through RLS-scoped selects. Writes go through the SECURITY DEFINER
 * RPCs in `20260915000012_phase_3_2a_catalog_rpcs.sql`.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  booleanValue,
  createTableAdapter,
  numberOrNull,
  textOrNull,
} from "@/lib/org/crud-adapter";
import type { ResourceValues } from "@/lib/crud/types";
import type { SelectOption } from "@/components/ui/select";

type Row = Record<string, unknown>;

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNullableString(value: unknown): string | null {
  const text = asString(value).trim();
  return text === "" ? null : text;
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function asNullableNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function asBoolean(value: unknown, fallback = true): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function embedName(value: unknown): string | null {
  if (!value) return null;
  const record = (Array.isArray(value) ? value[0] : value) as
    | { name?: string; code?: string; full_name?: string; first_name?: string; last_name?: string }
    | null;
  if (!record) return null;
  if (record.full_name) return record.full_name;
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  if (record.name && record.code) return `${record.name} (${record.code})`;
  return record.name ?? null;
}

function numberString(value: unknown, fallback = ""): string {
  if (value === null || value === undefined || value === "") return fallback;
  return String(value);
}

export interface TrainerRow {
  id: string;
  organizationId: string;
  branchId: string | null;
  branchName: string | null;
  code: string | null;
  firstName: string;
  lastName: string;
  fullName: string;
  email: string | null;
  phone: string | null;
  specialization: string | null;
  bio: string | null;
  hourlyRate: number | null;
  status: string;
  joinedAt: string;
}

export interface MembershipPlanRow {
  id: string;
  organizationId: string;
  name: string;
  code: string;
  description: string | null;
  durationDays: number;
  price: number;
  signupFee: number;
  taxRate: number;
  maxFreezeDays: number;
  isActive: boolean;
  sortOrder: number;
}

export interface GstRateRow {
  id: string;
  organizationId: string;
  name: string;
  rate: number;
  hsnSac: string | null;
  isDefault: boolean;
  isActive: boolean;
}

export interface ExerciseRow {
  id: string;
  organizationId: string;
  name: string;
  category: string | null;
  muscleGroup: string | null;
  equipment: string | null;
  difficulty: string | null;
  instructions: string | null;
  videoUrl: string | null;
  isActive: boolean;
}

export interface ClassTemplateRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  capacity: number;
  trainerId: string | null;
  trainerName: string | null;
  isActive: boolean;
}

export interface ProductRow {
  id: string;
  organizationId: string;
  name: string;
  sku: string | null;
  description: string | null;
  category: string | null;
  unit: string;
  costPrice: number;
  salePrice: number;
  taxRate: number;
  trackStock: boolean;
  stockQuantity: number;
  reorderLevel: number;
  isActive: boolean;
}

export interface SupplierRow {
  id: string;
  organizationId: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  gstin: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  notes: string | null;
  isActive: boolean;
}

export async function loadTrainerOptions(organizationId: string): Promise<SelectOption[]> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return [];
  const { data } = await supabase
    .from("trainers" as "gym_members")
    .select("id, full_name, first_name, last_name, status")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .order("first_name", { ascending: true });
  return ((data ?? []) as unknown as Row[]).map((row) => {
    const fullName =
      asNullableString(row.full_name) ||
      [asString(row.first_name), asString(row.last_name)].filter(Boolean).join(" ").trim() ||
      "Trainer";
    return { value: asString(row.id), label: fullName };
  });
}

export const trainerAdapter = createTableAdapter<TrainerRow>({
  table: "trainers",
  select:
    "id, organization_id, branch_id, code, first_name, last_name, full_name, email, phone, specialization, bio, hourly_rate, status, joined_at, branches(id, name, code)",
  searchColumns: ["full_name", "code", "email", "phone"],
  order: { column: "first_name" },
  filterColumns: { status: "status" },
  mapRow: (row): TrainerRow => {
    const firstName = asString(row.first_name);
    const lastName = asString(row.last_name);
    return {
      id: asString(row.id),
      organizationId: asString(row.organization_id),
      branchId: asNullableString(row.branch_id),
      branchName: embedName(row.branches),
      code: asNullableString(row.code),
      firstName,
      lastName,
      fullName:
        asNullableString(row.full_name) ||
        [firstName, lastName].filter(Boolean).join(" ").trim() ||
        asNullableString(row.code) ||
        "Trainer",
      email: asNullableString(row.email),
      phone: asNullableString(row.phone),
      specialization: asNullableString(row.specialization),
      bio: asNullableString(row.bio),
      hourlyRate: asNullableNumber(row.hourly_rate),
      status: asString(row.status) || "active",
      joinedAt: asString(row.joined_at),
    };
  },
  toFormValues: (row): ResourceValues => ({
    firstName: row.firstName,
    lastName: row.lastName,
    code: row.code ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    specialization: row.specialization ?? "",
    bio: row.bio ?? "",
    hourlyRate: numberString(row.hourlyRate),
    joinedAt: row.joinedAt ?? "",
    branchId: row.branchId ?? "",
  }),
  rpcCreate: "create_trainer",
  rpcUpdate: "update_trainer",
  idUpdateParam: "p_trainer_id",
  buildCreateParams: (values) => trainerParams(values),
  buildUpdateParams: (values) => trainerParams(values),
  setActiveRpc: "set_trainer_status",
  setActiveIdParam: "p_trainer_id",
  setActiveValueParam: "p_active",
});

function trainerParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_first_name: textOrNull(values.firstName) ?? "",
    p_last_name: textOrNull(values.lastName) ?? "",
    p_code: textOrNull(values.code),
    p_email: textOrNull(values.email),
    p_phone: textOrNull(values.phone),
    p_specialization: textOrNull(values.specialization),
    p_bio: textOrNull(values.bio),
    p_hourly_rate: numberOrNull(values.hourlyRate),
    p_joined_at: textOrNull(values.joinedAt),
  };
}

export const membershipPlanAdapter = createTableAdapter<MembershipPlanRow>({
  table: "membership_plans",
  select:
    "id, organization_id, name, code, description, duration_days, price, signup_fee, tax_rate, max_freeze_days, is_active, sort_order",
  searchColumns: ["name", "code"],
  order: { column: "sort_order" },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): MembershipPlanRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    code: asString(row.code),
    description: asNullableString(row.description),
    durationDays: asNumber(row.duration_days),
    price: asNumber(row.price),
    signupFee: asNumber(row.signup_fee),
    taxRate: asNumber(row.tax_rate),
    maxFreezeDays: asNumber(row.max_freeze_days),
    isActive: asBoolean(row.is_active),
    sortOrder: asNumber(row.sort_order),
  }),
  toFormValues: (row): ResourceValues => ({
    name: row.name,
    code: row.code,
    description: row.description ?? "",
    durationDays: numberString(row.durationDays),
    price: numberString(row.price, "0"),
    signupFee: numberString(row.signupFee, "0"),
    taxRate: numberString(row.taxRate, "0"),
    maxFreezeDays: numberString(row.maxFreezeDays, "0"),
    sortOrder: numberString(row.sortOrder, "0"),
    isActive: row.isActive,
  }),
  rpcCreate: "create_membership_plan",
  rpcUpdate: "update_membership_plan",
  idUpdateParam: "p_plan_id",
  buildCreateParams: (values) => membershipPlanParams(values),
  buildUpdateParams: (values) => membershipPlanParams(values),
  setActiveRpc: "set_membership_plan_status",
  setActiveIdParam: "p_plan_id",
  setActiveValueParam: "p_active",
});

function membershipPlanParams(values: ResourceValues) {
  return {
    p_name: textOrNull(values.name) ?? "",
    p_code: textOrNull(values.code) ?? "",
    p_description: textOrNull(values.description),
    p_duration_days: numberOrNull(values.durationDays) ?? 0,
    p_price: numberOrNull(values.price) ?? 0,
    p_signup_fee: numberOrNull(values.signupFee) ?? 0,
    p_tax_rate: numberOrNull(values.taxRate) ?? 0,
    p_max_freeze_days: numberOrNull(values.maxFreezeDays) ?? 0,
    p_sort_order: numberOrNull(values.sortOrder) ?? 0,
    p_is_active: booleanValue(values.isActive),
  };
}

export const gstRateAdapter = createTableAdapter<GstRateRow>({
  table: "gst_rates",
  select: "id, organization_id, name, rate, hsn_sac, is_default, is_active",
  searchColumns: ["name", "hsn_sac"],
  order: { column: "name" },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): GstRateRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    rate: asNumber(row.rate),
    hsnSac: asNullableString(row.hsn_sac),
    isDefault: asBoolean(row.is_default, false),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    name: row.name,
    rate: numberString(row.rate),
    hsnSac: row.hsnSac ?? "",
    isDefault: row.isDefault,
    isActive: row.isActive,
  }),
  rpcCreate: "create_gst_rate",
  rpcUpdate: "update_gst_rate",
  idUpdateParam: "p_rate_id",
  buildCreateParams: (values) => gstRateParams(values),
  buildUpdateParams: (values) => gstRateParams(values),
  setActiveRpc: "set_gst_rate_status",
  setActiveIdParam: "p_rate_id",
  setActiveValueParam: "p_active",
});

function gstRateParams(values: ResourceValues) {
  return {
    p_name: textOrNull(values.name) ?? "",
    p_rate: numberOrNull(values.rate) ?? 0,
    p_hsn_sac: textOrNull(values.hsnSac),
    p_is_default: booleanValue(values.isDefault),
    p_is_active: booleanValue(values.isActive),
  };
}

export const exerciseAdapter = createTableAdapter<ExerciseRow>({
  table: "exercises",
  select:
    "id, organization_id, name, category, muscle_group, equipment, difficulty, instructions, video_url, is_active",
  searchColumns: ["name", "category", "muscle_group", "equipment"],
  order: { column: "name" },
  filterColumns: { isActive: "is_active", difficulty: "difficulty" },
  mapRow: (row): ExerciseRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    category: asNullableString(row.category),
    muscleGroup: asNullableString(row.muscle_group),
    equipment: asNullableString(row.equipment),
    difficulty: asNullableString(row.difficulty),
    instructions: asNullableString(row.instructions),
    videoUrl: asNullableString(row.video_url),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    name: row.name,
    category: row.category ?? "",
    muscleGroup: row.muscleGroup ?? "",
    equipment: row.equipment ?? "",
    difficulty: row.difficulty ?? "",
    instructions: row.instructions ?? "",
    videoUrl: row.videoUrl ?? "",
    isActive: row.isActive,
  }),
  rpcCreate: "create_exercise",
  rpcUpdate: "update_exercise",
  idUpdateParam: "p_exercise_id",
  buildCreateParams: (values) => exerciseParams(values),
  buildUpdateParams: (values) => exerciseParams(values),
  setActiveRpc: "set_exercise_status",
  setActiveIdParam: "p_exercise_id",
  setActiveValueParam: "p_active",
});

function exerciseParams(values: ResourceValues) {
  return {
    p_name: textOrNull(values.name) ?? "",
    p_category: textOrNull(values.category),
    p_muscle_group: textOrNull(values.muscleGroup),
    p_equipment: textOrNull(values.equipment),
    p_difficulty: textOrNull(values.difficulty),
    p_instructions: textOrNull(values.instructions),
    p_video_url: textOrNull(values.videoUrl),
    p_is_active: booleanValue(values.isActive),
  };
}

export const classTemplateAdapter = createTableAdapter<ClassTemplateRow>({
  table: "class_templates",
  select:
    "id, organization_id, branch_id, name, description, duration_minutes, capacity, trainer_id, is_active, branches(id, name, code), trainers(id, full_name, first_name, last_name)",
  searchColumns: ["name"],
  order: { column: "name" },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): ClassTemplateRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    branchId: asString(row.branch_id),
    branchName: embedName(row.branches) ?? "Unknown branch",
    name: asString(row.name),
    description: asNullableString(row.description),
    durationMinutes: asNumber(row.duration_minutes, 60),
    capacity: asNumber(row.capacity),
    trainerId: asNullableString(row.trainer_id),
    trainerName: embedName(row.trainers),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    branchId: row.branchId,
    name: row.name,
    description: row.description ?? "",
    durationMinutes: numberString(row.durationMinutes, "60"),
    capacity: numberString(row.capacity, "0"),
    trainerId: row.trainerId ?? "",
    isActive: row.isActive,
  }),
  rpcCreate: "create_class_template",
  rpcUpdate: "update_class_template",
  idUpdateParam: "p_template_id",
  buildCreateParams: (values) => classTemplateParams(values),
  buildUpdateParams: (values) => classTemplateParams(values),
  setActiveRpc: "set_class_template_status",
  setActiveIdParam: "p_template_id",
  setActiveValueParam: "p_active",
});

function classTemplateParams(values: ResourceValues) {
  return {
    p_branch_id: textOrNull(values.branchId),
    p_name: textOrNull(values.name) ?? "",
    p_description: textOrNull(values.description),
    p_duration_minutes: numberOrNull(values.durationMinutes) ?? 0,
    p_capacity: numberOrNull(values.capacity) ?? 0,
    p_trainer_id: textOrNull(values.trainerId),
    p_is_active: booleanValue(values.isActive),
  };
}

export const productAdapter = createTableAdapter<ProductRow>({
  table: "products",
  select:
    "id, organization_id, name, sku, description, category, unit, cost_price, sale_price, tax_rate, track_stock, stock_quantity, reorder_level, is_active",
  searchColumns: ["name", "sku", "category"],
  order: { column: "name" },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): ProductRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    sku: asNullableString(row.sku),
    description: asNullableString(row.description),
    category: asNullableString(row.category),
    unit: asString(row.unit) || "pcs",
    costPrice: asNumber(row.cost_price),
    salePrice: asNumber(row.sale_price),
    taxRate: asNumber(row.tax_rate),
    trackStock: asBoolean(row.track_stock),
    stockQuantity: asNumber(row.stock_quantity),
    reorderLevel: asNumber(row.reorder_level),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    name: row.name,
    sku: row.sku ?? "",
    description: row.description ?? "",
    category: row.category ?? "",
    unit: row.unit || "pcs",
    costPrice: numberString(row.costPrice, "0"),
    salePrice: numberString(row.salePrice, "0"),
    taxRate: numberString(row.taxRate, "0"),
    trackStock: row.trackStock,
    stockQuantity: numberString(row.stockQuantity, "0"),
    reorderLevel: numberString(row.reorderLevel, "0"),
    isActive: row.isActive,
  }),
  rpcCreate: "create_product",
  rpcUpdate: "update_product",
  idUpdateParam: "p_product_id",
  buildCreateParams: (values) => productParams(values),
  buildUpdateParams: (values) => productParams(values),
  setActiveRpc: "set_product_status",
  setActiveIdParam: "p_product_id",
  setActiveValueParam: "p_active",
});

function productParams(values: ResourceValues) {
  return {
    p_name: textOrNull(values.name) ?? "",
    p_sku: textOrNull(values.sku),
    p_description: textOrNull(values.description),
    p_category: textOrNull(values.category),
    p_unit: textOrNull(values.unit) ?? "pcs",
    p_cost_price: numberOrNull(values.costPrice) ?? 0,
    p_sale_price: numberOrNull(values.salePrice) ?? 0,
    p_tax_rate: numberOrNull(values.taxRate) ?? 0,
    p_track_stock: booleanValue(values.trackStock),
    p_stock_quantity: numberOrNull(values.stockQuantity) ?? 0,
    p_reorder_level: numberOrNull(values.reorderLevel) ?? 0,
    p_is_active: booleanValue(values.isActive),
  };
}

export const supplierAdapter = createTableAdapter<SupplierRow>({
  table: "suppliers",
  select:
    "id, organization_id, name, contact_name, email, phone, gstin, address_line1, address_line2, city, state, postal_code, country, notes, is_active",
  searchColumns: ["name", "contact_name", "email", "phone", "gstin"],
  order: { column: "name" },
  filterColumns: { isActive: "is_active" },
  mapRow: (row): SupplierRow => ({
    id: asString(row.id),
    organizationId: asString(row.organization_id),
    name: asString(row.name),
    contactName: asNullableString(row.contact_name),
    email: asNullableString(row.email),
    phone: asNullableString(row.phone),
    gstin: asNullableString(row.gstin),
    addressLine1: asNullableString(row.address_line1),
    addressLine2: asNullableString(row.address_line2),
    city: asNullableString(row.city),
    state: asNullableString(row.state),
    postalCode: asNullableString(row.postal_code),
    country: asNullableString(row.country),
    notes: asNullableString(row.notes),
    isActive: asBoolean(row.is_active),
  }),
  toFormValues: (row): ResourceValues => ({
    name: row.name,
    contactName: row.contactName ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    gstin: row.gstin ?? "",
    addressLine1: row.addressLine1 ?? "",
    addressLine2: row.addressLine2 ?? "",
    city: row.city ?? "",
    state: row.state ?? "",
    postalCode: row.postalCode ?? "",
    country: row.country ?? "",
    notes: row.notes ?? "",
    isActive: row.isActive,
  }),
  rpcCreate: "create_supplier",
  rpcUpdate: "update_supplier",
  idUpdateParam: "p_supplier_id",
  buildCreateParams: (values) => supplierParams(values),
  buildUpdateParams: (values) => supplierParams(values),
  setActiveRpc: "set_supplier_status",
  setActiveIdParam: "p_supplier_id",
  setActiveValueParam: "p_active",
});

function supplierParams(values: ResourceValues) {
  return {
    p_name: textOrNull(values.name) ?? "",
    p_contact_name: textOrNull(values.contactName),
    p_email: textOrNull(values.email),
    p_phone: textOrNull(values.phone),
    p_gstin: textOrNull(values.gstin),
    p_address_line1: textOrNull(values.addressLine1),
    p_address_line2: textOrNull(values.addressLine2),
    p_city: textOrNull(values.city),
    p_state: textOrNull(values.state),
    p_postal_code: textOrNull(values.postalCode),
    p_country: textOrNull(values.country),
    p_notes: textOrNull(values.notes),
    p_is_active: booleanValue(values.isActive),
  };
}
