import type { Metadata } from "next";
import { OperationsDetail } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Diet plan" };

export default async function DietPlanDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsDetail resource="diet_plans" id={id} />;
}
