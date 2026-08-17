import { redirect } from "next/navigation";
import { AuthProvider } from "@/components/auth/auth-provider";
import { resolveAppContext, isSupabaseConfigured } from "@/lib/auth/server";

export default async function OnboardingLayout({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured) {
    const resolved = await resolveAppContext();
    if (resolved.status === "ok") redirect("/dashboard");
    if (resolved.status === "unauthenticated") redirect("/login");
    // no_organization: proceed with onboarding.
  }

  return (
    <AuthProvider>
      <div className="min-h-screen bg-surface-muted">{children}</div>
    </AuthProvider>
  );
}
