import type { Metadata } from "next";
import { MembershipSettingsForm } from "@/components/settings/membership-settings-form";

export const metadata: Metadata = { title: "Membership" };

export default function MembershipSettingsPage() {
  return <MembershipSettingsForm />;
}
