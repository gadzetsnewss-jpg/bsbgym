import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add workout plan" };

export default function AddWorkoutPlanPage() {
  return <OperationsForm resource="workout_plans" mode="create" />;
}
