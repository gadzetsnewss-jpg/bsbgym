import type { Metadata } from "next";
import { OperationsList } from "@/components/operations/operations-screens";

export const metadata: Metadata = { title: "Freeze / extend" };

export default function MembershipFreezePage() {
  return <OperationsList resource="membership_freezes" />;
}
