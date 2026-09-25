import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add diet plan" };

export default function AddDietPlanPage() {
  return <OperationsForm resource="diet_plans" mode="create" />;
}
