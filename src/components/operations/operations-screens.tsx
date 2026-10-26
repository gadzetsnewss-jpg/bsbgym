"use client";

import type { ReactNode } from "react";
import { ResourceDetail, ResourceForm, ResourceList } from "@/components/crud";
import type { ResourceConfig, ResourceValues } from "@/lib/crud/types";
import {
  OPERATIONS_RESOURCES,
  type OperationsResourceKey,
} from "@/lib/operations/resources";
import { membershipDetailExtras } from "@/components/memberships/membership-detail-extras";
import {
  dietPlanDetailExtras,
  workoutPlanDetailExtras,
} from "@/components/fitness/plan-item-panels";
import { ptSessionDetailExtras } from "@/components/trainers/pt-session-status";
import type { DietPlanRow, MembershipRow, PtSessionRow, WorkoutPlanRow } from "@/lib/operations/adapters";

function operationsConfig(resource: OperationsResourceKey): ResourceConfig<unknown> {
  return OPERATIONS_RESOURCES[resource] as ResourceConfig<unknown>;
}

export function OperationsList({
  resource,
  title,
  description,
  emptyDescription,
}: {
  resource: OperationsResourceKey;
  title?: string;
  description?: string;
  emptyDescription?: string;
}) {
  return (
    <ResourceList
      config={operationsConfig(resource)}
      title={title}
      description={description}
      emptyDescription={emptyDescription}
    />
  );
}

export function OperationsForm({
  resource,
  mode,
  id,
  defaults,
}: {
  resource: OperationsResourceKey;
  mode: "create" | "edit";
  id?: string;
  defaults?: ResourceValues;
}) {
  return <ResourceForm config={operationsConfig(resource)} mode={mode} id={id} defaults={defaults} />;
}

export function OperationsDetail({
  resource,
  id,
  children,
}: {
  resource: OperationsResourceKey;
  id: string;
  children?: ReactNode;
}) {
  const extras =
    resource === "memberships_active" ||
    resource === "memberships_renewals" ||
    resource === "memberships_expiring"
      ? (row: unknown) => membershipDetailExtras(row as MembershipRow)
      : resource === "workout_plans"
        ? (row: unknown) => workoutPlanDetailExtras(row as WorkoutPlanRow)
      : resource === "diet_plans"
        ? (row: unknown) => dietPlanDetailExtras(row as DietPlanRow)
        : resource === "pt_sessions"
          ? (row: unknown) => ptSessionDetailExtras(row as PtSessionRow)
          : undefined;
  return (
    <ResourceDetail config={operationsConfig(resource)} id={id} extras={extras}>
      {children}
    </ResourceDetail>
  );
}
