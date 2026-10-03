import type { Metadata } from "next";
import { AddMemberForm } from "@/components/members/add-member-form";

export const metadata: Metadata = {
  title: "Add member",
};

export default function AddMemberPage() {
  return <AddMemberForm />;
}
