import type { Metadata } from "next";
import { CatalogDetail } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Exercise" };

export default async function ExerciseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail resource="exercises" id={id} />;
}
