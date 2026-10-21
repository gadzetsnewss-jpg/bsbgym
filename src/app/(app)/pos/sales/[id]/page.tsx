import type { Metadata } from "next";
import { SaleReceipt } from "@/components/inventory/sale-receipt";

export const metadata: Metadata = { title: "Receipt" };

export default async function SaleReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SaleReceipt saleId={id} />;
}
