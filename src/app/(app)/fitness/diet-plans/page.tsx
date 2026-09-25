import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Diet plans" };

export default function DietPlansPage() {
  return <OperationsList resource="diet_plans" />;
}
