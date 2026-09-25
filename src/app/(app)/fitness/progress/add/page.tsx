import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add progress entry" };

export default function AddProgressEntryPage() {
  return <OperationsForm resource="progress_entries" mode="create" />;
}
