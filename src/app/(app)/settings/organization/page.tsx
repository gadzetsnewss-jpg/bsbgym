import type { Metadata } from "next";
import { OrganizationForm } from "@/components/settings/organization-form";

export const metadata: Metadata = {
  title: "Organization",
};

export default function OrganizationPage() {
  return <OrganizationForm />;
}
