import type { Metadata } from "next";
import { OperationsDetail } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendanceDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsDetail resource="attendance_records" id={id} />;
}
