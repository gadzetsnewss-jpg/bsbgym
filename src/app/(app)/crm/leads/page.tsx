import type { Metadata } from "next";
import { CrmList } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Leads" };

export default function LeadsPage() {
  return <CrmList resource="leads" />;
}
