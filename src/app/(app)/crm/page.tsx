import type { Metadata } from "next";
import { CrmDashboard } from "@/components/crm/crm-dashboard";

export const metadata: Metadata = { title: "CRM" };

export default function CrmPage() {
  return <CrmDashboard />;
}
