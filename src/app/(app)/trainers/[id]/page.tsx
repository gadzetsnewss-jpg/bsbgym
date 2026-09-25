import type { Metadata } from "next";
import { CatalogDetail } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Trainer" };

export default async function TrainerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CatalogDetail resource="trainers" id={id} />;
}
