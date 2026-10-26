import type { Metadata } from "next";
import { TrainersHome } from "@/components/trainers/trainers-home";

export const metadata: Metadata = { title: "Trainers" };

export default function TrainersPage() {
  return <TrainersHome />;
}
