import type { Metadata } from "next";
import { MemberForm } from "@/components/members/member-form";

export const metadata: Metadata = {
  title: "Edit member",
};

export default async function EditMemberPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemberForm mode="edit" memberId={id} />;
}
