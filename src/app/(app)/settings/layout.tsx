"use client";

import { usePathname } from "next/navigation";
import { SettingsHubShell } from "@/components/settings/settings-hub";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/settings" || pathname === "/settings/profile") {
    return children;
  }
  return <SettingsHubShell>{children}</SettingsHubShell>;
}
