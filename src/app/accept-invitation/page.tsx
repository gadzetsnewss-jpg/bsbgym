"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Dumbbell, MailCheck, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { AuthProvider, useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice } from "@/components/auth/password-input";
import { useQueryParam } from "@/hooks/use-query-param";
import { acceptInvitation } from "@/lib/org/members";
import { isSupabaseConfigured } from "@/lib/supabase/client";

function AcceptInvitationContent() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, status, user } = useAuth();
  const token = useQueryParam("token");

  const [accepting, setAccepting] = React.useState(false);
  const [result, setResult] = React.useState<{
    ok: boolean;
    message: string;
    organization?: string;
  } | null>(null);

  const signInLink = token
    ? `/login?next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`
    : "/login";
  const signUpLink = token
    ? `/signup?next=${encodeURIComponent(`/accept-invitation?token=${token}`)}`
    : "/signup";

  React.useEffect(() => {
    if (!configured || !token || status !== "authenticated" || accepting || result) return;
    if (!isSupabaseConfigured) return;

    let active = true;
    setAccepting(true);
    void (async () => {
      const res = await acceptInvitation(token);
      if (!active) return;
      setAccepting(false);

      if (res.error) {
        setResult({ ok: false, message: res.error.message });
        return;
      }

      setResult({
        ok: true,
        message: `You've joined ${res.data.name} as a member.`,
        organization: res.data.name,
      });
      toast({
        title: "Invitation accepted",
        description: `Welcome to ${res.data.name}.`,
        variant: "success",
      });
      window.setTimeout(() => router.replace("/dashboard"), 1200);
    })();

    return () => {
      active = false;
    };
  }, [configured, token, status, accepting, result, router, toast]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface-muted px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2.5">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-gradient text-white">
            <Dumbbell aria-hidden="true" className="size-6" />
          </div>
          <span className="text-xl font-semibold tracking-tight text-ink">
            BSB <span className="text-primary-700">FitForge</span>
          </span>
        </div>

        <Card className="p-6 text-center">
          {!configured ? (
            <React.Fragment>
              <h2 className="text-lg font-semibold text-ink">Invitation</h2>
              <NotConfiguredNotice className="mt-4 text-left" />
            </React.Fragment>
          ) : !token ? (
            <React.Fragment>
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <TriangleAlert aria-hidden="true" className="size-6" />
              </div>
              <h2 className="text-lg font-semibold text-ink">Missing invitation link</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Open the invitation link from your email to continue.
              </p>
            </React.Fragment>
          ) : result ? (
            result.ok ? (
              <React.Fragment>
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
                  <MailCheck aria-hidden="true" className="size-6" />
                </div>
                <h2 className="text-lg font-semibold text-ink">Welcome to {result.organization}</h2>
                <p className="mt-1 text-sm text-neutral-500">{result.message}</p>
                <p className="mt-4 text-xs text-neutral-400">Taking you to your dashboard…</p>
              </React.Fragment>
            ) : (
              <React.Fragment>
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                  <TriangleAlert aria-hidden="true" className="size-6" />
                </div>
                <h2 className="text-lg font-semibold text-ink">Invitation unavailable</h2>
                <p className="mt-1 text-sm text-neutral-500">{result.message}</p>
                <Button variant="outline" className="mt-5" onClick={() => setResult(null)}>
                  Try again
                </Button>
              </React.Fragment>
            )
          ) : status === "loading" || accepting ? (
            <React.Fragment>
              <p className="text-sm text-neutral-500">Validating your invitation…</p>
            </React.Fragment>
          ) : status === "unauthenticated" || !user ? (
            <React.Fragment>
              <h2 className="text-lg font-semibold text-ink">Sign in to accept your invitation</h2>
              <p className="mt-1 text-sm text-neutral-500">
                Use the same email address the invitation was sent to.
              </p>
              <div className="mt-5 flex flex-col gap-2">
                <Button size="lg" fullWidth onClick={() => router.push(signInLink)}>
                  Sign in
                </Button>
                <Button variant="outline" size="lg" fullWidth onClick={() => router.push(signUpLink)}>
                  Create an account
                </Button>
              </div>
            </React.Fragment>
          ) : (
            <React.Fragment>
              <p className="text-sm text-neutral-500">Accepting your invitation…</p>
            </React.Fragment>
          )}

          {!result && (
            <p className="mt-6 text-xs text-neutral-400">
              Something wrong?{" "}
              <Link href="/forgot-password" className="font-medium text-primary-700">
                Contact the sender
              </Link>
            </p>
          )}
        </Card>
      </div>
    </div>
  );
}

export default function AcceptInvitationPage() {
  return (
    <AuthProvider>
      <AcceptInvitationContent />
    </AuthProvider>
  );
}
