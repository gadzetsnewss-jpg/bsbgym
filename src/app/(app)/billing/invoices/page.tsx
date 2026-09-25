import type { Metadata } from "next";
import { InvoicesList } from "@/components/billing/invoices-list";

export const metadata: Metadata = { title: "Invoices" };

export default function InvoicesPage() {
  return <InvoicesList />;
}
