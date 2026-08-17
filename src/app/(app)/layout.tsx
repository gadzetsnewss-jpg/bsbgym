import { redirect } from "next/navigation";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { OrgProvider } from "@/components/auth/org-provider";
import { resolveAppContext, isSupabaseConfigured } from "@/lib/auth/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  // Preview mode: no Supabase credentials - keep the Phase 0 shell functional.
  if (!isSupabaseConfigured) {
    return (
      <AuthProvider>
        <OrgProvider initial={null}>
          <AppShell>{children}</AppShell>
        </OrgProvider>
      </AuthProvider>
    );
  }

  const resolved = await resolveAppContext();

  if (resolved.status === "unauthenticated") {
    redirect("/login?next=%2Fdashboard");
  }

  if (resolved.status === "no_organization") {
    redirect("/onboarding");
  }

  return (
    <AuthProvider>
      <OrgProvider initial={resolved.context ?? null}>
        <AppShell>{children}</AppShell>
      </OrgProvider>
    </AuthProvider>
  );
}
