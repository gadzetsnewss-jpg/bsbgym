import type { Metadata } from "next";
import UsersRolesPanel from "@/components/settings/users-roles";

export const metadata: Metadata = {
  title: "Users & Roles",
};

export default function UsersRolesPage() {
  return <UsersRolesPanel />;
}
