import type { Metadata } from "next";
import { TransactionsList } from "@/components/finance/transactions-list";

export const metadata: Metadata = { title: "Transactions" };

export default function TransactionsPage() {
  return <TransactionsList />;
}
