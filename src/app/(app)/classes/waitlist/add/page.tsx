import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add waitlist entry" };

export default function AddWaitlistBookingPage() {
  return <OperationsForm resource="class_waitlist" mode="create" />;
}
