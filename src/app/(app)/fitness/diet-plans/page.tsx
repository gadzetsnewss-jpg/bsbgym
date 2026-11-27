import type { Metadata } from "next";
import { DietPlansHome } from "@/components/fitness/diet-plans-home";

export const metadata: Metadata = { title: "Diet plans" };

export default function DietPlansPage() {
  return <DietPlansHome />;
}
