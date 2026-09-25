import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Edit exercise" };

export default async function EditExercisePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogForm resource="exercises" mode="edit" id={id} />;
}
