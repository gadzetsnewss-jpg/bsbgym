"use client";

import type { ReactNode } from "react";
import { ResourceDetail, ResourceForm, ResourceList } from "@/components/crud";
import type { ResourceConfig, ResourceValues } from "@/lib/crud/types";
import {
  OPERATIONS_RESOURCES,
  type OperationsResourceKey,
} from "@/lib/operations/resources";
import { membershipDetailExtras } from "@/components/memberships/membership-detail-extras";
import type { MembershipRow } from "@/lib/operations/adapters";

function operationsConfig(resource: OperationsResourceKey): ResourceConfig<unknown> {
  return OPERATIONS_RESOURCES[resource] as ResourceConfig<unknown>;
}

export function OperationsList({ resource }: { resource: OperationsResourceKey }) {
  return <ResourceList config={operationsConfig(resource)} />;
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
    resource === "memberships_active" || resource === "memberships_renewals"
      ? (row: unknown) => membershipDetailExtras(row as MembershipRow)
      : undefined;
  return (
    <ResourceDetail config={operationsConfig(resource)} id={id} extras={extras}>
      {children}
    </ResourceDetail>
  );
}
