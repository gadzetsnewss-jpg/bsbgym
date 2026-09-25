import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "PT sessions" };

export default function PtSessionsPage() {
  return <OperationsList resource="pt_sessions" />;
}
