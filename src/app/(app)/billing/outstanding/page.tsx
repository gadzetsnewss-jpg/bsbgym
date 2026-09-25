import type { Metadata } from "next";
import { OutstandingList } from "@/components/billing/outstanding-list";

export const metadata: Metadata = { title: "Outstanding" };

export default function OutstandingPage() {
  return <OutstandingList />;
}
