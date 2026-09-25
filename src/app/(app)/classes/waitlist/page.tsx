import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Waitlist" };

export default function ClassWaitlistPage() {
  return <OperationsList resource="class_waitlist" />;
}
