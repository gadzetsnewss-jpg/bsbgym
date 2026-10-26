import type { Metadata } from "next";
import { PtSessionsHome } from "@/components/trainers/pt-sessions-home";

export const metadata: Metadata = { title: "PT sessions" };

export default function PtSessionsPage() {
  return <PtSessionsHome />;
}
