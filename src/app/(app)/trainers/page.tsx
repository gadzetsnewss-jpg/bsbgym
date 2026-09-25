import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Trainers" };

export default function TrainersPage() {
  return <CatalogList resource="trainers" />;
}
