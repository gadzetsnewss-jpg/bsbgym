import type { Metadata } from "next";
import { RolesManagerPanel } from "@/components/settings/roles-manager";

export const metadata: Metadata = {
  title: "Permissions",
};

export default function PermissionsPage() {
  return <RolesManagerPanel />;
}
