import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Measurements" };

export default function MeasurementsPage() {
  return <OperationsList resource="body_measurements" />;
}
