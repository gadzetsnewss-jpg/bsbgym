import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Workout plans" };

export default function WorkoutPlansPage() {
  return <OperationsList resource="workout_plans" />;
}
