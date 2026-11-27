import type { Metadata } from "next";
import { DietPlanBuilder } from "@/components/fitness/diet-plan-builder";

export const metadata: Metadata = { title: "Edit diet plan" };

export default async function EditDietPlanPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DietPlanBuilder mode="edit" id={id} />;
}
