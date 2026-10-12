import type { Metadata } from "next";
import { CrmList } from "@/components/crm/crm-screens";

export const metadata: Metadata = { title: "Trials" };

export default function TrialsPage() {
  return <CrmList resource="trial_memberships" />;
}
