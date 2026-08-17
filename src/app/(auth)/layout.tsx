import { redirect } from "next/navigation";
import { Dumbbell, ShieldCheck } from "lucide-react";
import { AuthProvider } from "@/components/auth/auth-provider";
import { resolveAppContext, isSupabaseConfigured } from "@/lib/auth/server";

const BRAND_POINTS = [
  "Members, memberships and multi-branch management",
  "Professional billing with GST-ready invoices",
  "Attendance, classes, trainers and POS",
  "Reports and analytics that grow your gym",
];

export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  if (isSupabaseConfigured) {
    const resolved = await resolveAppContext();
    // Signed-in users never see auth screens.
    if (resolved.status === "ok") redirect("/dashboard");
    if (resolved.status === "no_organization") redirect("/onboarding");
  }

  return (
    <AuthProvider>
      <div className="grid min-h-screen lg:grid-cols-2">
        {/* Brand panel */}
        <div className="relative hidden flex-col justify-between overflow-hidden bg-primary-950 p-10 lg:flex">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-primary-500/20 blur-3xl"
          />
          <div
            aria-hidden="true"
            className="pointer-events-none absolute -bottom-40 -left-24 size-96 rounded-full bg-accent-500/15 blur-3xl"
          />

          <div className="relative flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
              <Dumbbell aria-hidden="true" className="size-6" />
            </div>
            <span className="text-xl font-semibold tracking-tight text-white">
              BSB <span className="text-primary-300">FitForge</span>
            </span>
          </div>

          <div className="relative max-w-md">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight text-white">
              Run your entire gym on one platform.
            </h1>
            <p className="mt-3 text-primary-100/70">
              The professional cloud ERP for fitness businesses — built for
              memberships, billing and growth in 2026.
            </p>
            <ul className="mt-8 space-y-3">
              {BRAND_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2.5 text-sm text-primary-100/80"
                >
                  <ShieldCheck
                    aria-hidden="true"
                    className="mt-0.5 size-4 shrink-0 text-primary-300"
                  />
                  {point}
                </li>
              ))}
            </ul>
          </div>

          <p className="relative text-xs text-primary-100/50">
            © {new Date().getFullYear()} BSB FitForge. All rights reserved.
          </p>
        </div>

        {/* Form panel */}
        <div className="flex items-center justify-center bg-surface-muted px-4 py-10 sm:px-8">
          <div className="w-full max-w-sm">
            <div className="mb-8 flex items-center gap-2.5 lg:hidden">
              <div className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
                <Dumbbell aria-hidden="true" className="size-6" />
              </div>
              <span className="text-xl font-semibold tracking-tight text-ink">
                BSB <span className="text-primary-700">FitForge</span>
              </span>
            </div>
            {children}
          </div>
        </div>
      </div>
    </AuthProvider>
  );
}
