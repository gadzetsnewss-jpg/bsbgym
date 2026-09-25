import type { Metadata } from "next";
import { CatalogForm } from "@/components/catalog/catalog-screens";

export const metadata: Metadata = { title: "Add exercise" };

export default function AddExercisePage() {
  return <CatalogForm resource="exercises" mode="create" />;
}
