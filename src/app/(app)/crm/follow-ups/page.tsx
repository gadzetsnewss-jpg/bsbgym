import type { Metadata } from "next";
import { CrmList } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Follow-ups" };

export default function FollowUpsPage() {
  return <CrmList resource="follow_ups" />;
}
