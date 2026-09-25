import type { Metadata } from "next";
import { OperationsDetail } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Assignment" };

export default async function TrainerAssignmentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsDetail resource="trainer_assignments" id={id} />;
}
