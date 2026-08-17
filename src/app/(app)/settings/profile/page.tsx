import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/page-header";
import { ProfileForm } from "@/components/settings/profile-form";

export const metadata: Metadata = {
  title: "My Profile",
};

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeader title="My Profile" description="Manage your personal account details." />
      <div className="mx-auto max-w-2xl">
        <ProfileForm />
      </div>
    </div>
  );
}
