import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Add booking" };

export default function AddClassBookingPage() {
  return <OperationsForm resource="class_bookings" mode="create" />;
}
