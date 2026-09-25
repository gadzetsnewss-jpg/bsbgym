import type { Metadata } from "next";
import { OperationsForm } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Edit attendance" };

export default async function EditAttendancePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsForm resource="attendance_records" mode="edit" id={id} />;
}
