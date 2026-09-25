import type { Metadata } from "next";
import { MemberForm } from "@/components/members/member-form";

export const metadata: Metadata = {
  title: "Add member",
};

export default function AddMemberPage() {
  return <MemberForm mode="create" />;
}
