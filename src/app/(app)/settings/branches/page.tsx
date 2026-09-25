import type { Metadata } from "next";
import { BranchesManager } from "@/components/settings/branches-manager";

export const metadata: Metadata = {
  title: "Branches",
};

export default function BranchesPage() {
  return <BranchesManager />;
}
