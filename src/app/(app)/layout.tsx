import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { AppShell } from "@/components/layout/app-shell";
import { AuthProvider } from "@/components/auth/auth-provider";
import { OrgProvider } from "@/components/auth/org-provider";
import { resolveAppContext, isSupabaseConfigured } from "@/lib/auth/server";
import { requiredPermissionForPath } from "@/config/route-permissions";

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

  // Route-level authorization (app-level gate; RLS is the enforcement).
  const headersList = await headers();
  const pathname = headersList.get("x-pathname") ?? "/dashboard";
  const required = requiredPermissionForPath(pathname);
  const context = resolved.context;
  if (context && required && !context.permissions.includes(required)) {
    redirect("/access-denied");
  }

  return (
    <AuthProvider>
      <OrgProvider initial={context ?? null}>
        <AppShell>{children}</AppShell>
      </OrgProvider>
    </AuthProvider>
  );
}
