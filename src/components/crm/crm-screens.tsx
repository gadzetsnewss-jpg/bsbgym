"use client";

import { ResourceDetail, ResourceForm, ResourceList } from "@/components/crud";
import type { ResourceConfig, ResourceValues } from "@/lib/crud/types";
import { CRM_RESOURCES, type CrmResourceKey } from "@/lib/crm/resources";

function crmConfig(resource: CrmResourceKey): ResourceConfig<unknown> {
  return CRM_RESOURCES[resource] as ResourceConfig<unknown>;
}

export function CrmList({ resource }: { resource: CrmResourceKey }) {
  return <ResourceList config={crmConfig(resource)} />;
}

export function CrmForm({
  resource,
  mode,
  id,
  defaults,
}: {
  resource: CrmResourceKey;
  mode: "create" | "edit";
  id?: string;
  defaults?: ResourceValues;
}) {
  return <ResourceForm config={crmConfig(resource)} mode={mode} id={id} defaults={defaults} />;
}

export function CrmDetail({ resource, id }: { resource: CrmResourceKey; id: string }) {
  return <ResourceDetail config={crmConfig(resource)} id={id} />;
}
