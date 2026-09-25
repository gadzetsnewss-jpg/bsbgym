import type { Metadata } from "next";
import { MembersList } from "@/components/members/members-list";

export const metadata: Metadata = {
  title: "Members",
};

export default function MembersPage() {
  return <MembersList />;
}
