import type { Metadata } from "next";
import { InvoicePrint } from "@/components/billing/invoice-print";

export const metadata: Metadata = { title: "Print invoice" };

export default async function InvoicePrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <InvoicePrint invoiceId={id} />;
}
