import type { Metadata } from "next";
import { DietPlanDetailView } from "@/components/fitness/diet-plan-detail-view";

export const metadata: Metadata = { title: "Diet plan" };

export default async function DietPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <DietPlanDetailView id={id} />;
}
