import type { Metadata } from "next";
import { OperationsDetail } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Progress entry" };

export default async function ProgressEntryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <OperationsDetail resource="progress_entries" id={id} />;
}
