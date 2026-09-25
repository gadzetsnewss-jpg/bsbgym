import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Edit trainer" };

export default async function EditTrainerPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogForm resource="trainers" mode="edit" id={id} />;
}
