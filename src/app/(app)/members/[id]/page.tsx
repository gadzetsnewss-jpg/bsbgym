import type { Metadata } from "next";
import { MemberDetail } from "@/components/members/member-detail";

export const metadata: Metadata = {
  title: "Member",
};

export default async function MemberDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <MemberDetail memberId={id} />;
}
