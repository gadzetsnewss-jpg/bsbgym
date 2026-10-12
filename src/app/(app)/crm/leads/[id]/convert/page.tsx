import type { Metadata } from "next";
import { ConvertLeadForm } from "@/components/crm/convert-lead-form";

export const metadata: Metadata = { title: "Convert lead" };

export default async function ConvertLeadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <ConvertLeadForm leadId={id} />;
}
