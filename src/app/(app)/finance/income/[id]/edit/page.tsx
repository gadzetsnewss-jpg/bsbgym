import type { Metadata } from "next";
import { IncomeForm } from "@/components/finance/income-form";

export const metadata: Metadata = { title: "Edit income" };

export default async function EditIncomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <IncomeForm entryId={id} />;
}
