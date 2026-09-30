import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Class schedule" };

export default function ClassSchedulePage() {
  return <OperationsList resource="class_sessions" />;
}
