"use client";

import { ResourceDetail, ResourceForm, ResourceList } from "@/components/crud";
import type { ResourceConfig } from "@/lib/crud/types";
import { CATALOG_RESOURCES, type CatalogResourceKey } from "@/lib/catalog/resources";

function catalogConfig(resource: CatalogResourceKey): ResourceConfig<unknown> {
  return CATALOG_RESOURCES[resource] as ResourceConfig<unknown>;
}

export function CatalogList({
  resource,
  title,
  description,
  emptyDescription,
}: {
  resource: CatalogResourceKey;
  title?: string;
  description?: string;
  emptyDescription?: string;
}) {
  return (
    <ResourceList
      config={catalogConfig(resource)}
      title={title}
      description={description}
      emptyDescription={emptyDescription}
    />
  );
}

export function CatalogForm({
  resource,
  mode,
  id,
}: {
  resource: CatalogResourceKey;
  mode: "create" | "edit";
  id?: string;
}) {
  return <ResourceForm config={catalogConfig(resource)} mode={mode} id={id} />;
}

export function CatalogDetail({ resource, id }: { resource: CatalogResourceKey; id: string }) {
  return <ResourceDetail config={catalogConfig(resource)} id={id} />;
}
