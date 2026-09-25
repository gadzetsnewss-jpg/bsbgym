import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Progress" };

export default function ProgressPage() {
  return <OperationsList resource="progress_entries" />;
}
