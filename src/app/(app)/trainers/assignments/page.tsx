import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Assignments" };

export default function TrainerAssignmentsPage() {
  return <OperationsList resource="trainer_assignments" />;
}
