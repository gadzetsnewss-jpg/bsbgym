import type { Metadata } from "next";
import { MembersList } from "@/components/members/members-list";

export const metadata: Metadata = {
  title: "Inactive members",
};

export default function InactiveMembersPage() {
  return (
    <MembersList
      initialStatus="inactive"
      title="Inactive members"
      description="Members who are currently deactivated."
    />
  );
}
