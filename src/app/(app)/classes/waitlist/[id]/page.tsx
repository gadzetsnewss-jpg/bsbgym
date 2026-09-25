import type { Metadata } from "next";
import { OperationsDetail } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Waitlist entry" };

export default async function WaitlistBookingDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsDetail resource="class_waitlist" id={id} />;
}
