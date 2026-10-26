import type { Metadata } from "next";
import { PurchaseDetail } from "@/components/inventory/purchase-detail";

export const metadata: Metadata = { title: "Purchase" };

export default async function PurchaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PurchaseDetail purchaseId={id} />;
}
