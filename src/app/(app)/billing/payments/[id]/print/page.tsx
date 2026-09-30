import type { Metadata } from "next";
import { PaymentReceipt } from "@/components/billing/payment-receipt";

export const metadata: Metadata = { title: "Print receipt" };

export default async function PaymentReceiptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <PaymentReceipt paymentId={id} />;
}
