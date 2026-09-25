import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add PT session" };

export default function AddPtSessionPage() {
  return <OperationsForm resource="pt_sessions" mode="create" />;
}
