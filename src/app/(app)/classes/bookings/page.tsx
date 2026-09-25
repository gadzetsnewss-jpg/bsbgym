import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Bookings" };

export default function ClassBookingsPage() {
  return <OperationsList resource="class_bookings" />;
}
