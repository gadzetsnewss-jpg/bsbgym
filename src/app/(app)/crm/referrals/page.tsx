import type { Metadata } from "next";
import { CrmList } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Referrals" };

export default function ReferralsPage() {
  return <CrmList resource="referrals" />;
}
