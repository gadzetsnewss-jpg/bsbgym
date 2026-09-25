import type { Metadata } from "next";
import { CatalogList } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Exercises" };

export default function ExercisesPage() {
  return <CatalogList resource="exercises" />;
}
