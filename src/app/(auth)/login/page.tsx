"use client";

import * as React from "react";
import { Dumbbell, Eye, EyeOff, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";

const BRAND_POINTS = [
  "Members, memberships and multi-branch management",
  "Professional billing with GST-ready invoices",
  "Attendance, classes, trainers and POS",
  "Reports and analytics that grow your gym",
];

export default function LoginPage() {
  const { toast } = useToast();
  const [showPassword, setShowPassword] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    // Phase 0: no authentication exists yet. Phase 1 replaces this handler
    // with supabase.auth.signInWithPassword().
    toast({
      title: "Sign-in coming in Phase 1",
      description:
        "Supabase Auth will handle real authentication. This screen is the login-ready foundation.",
      variant: "info",
    });
  };

  return (
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
              <li key={point} className="flex items-start gap-2.5 text-sm text-primary-100/80">
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

          <div className="mb-6">
            <h2 className="text-2xl font-semibold tracking-tight text-ink">
              Welcome back
            </h2>
            <p className="mt-1 text-sm text-neutral-500">
              Sign in to your gym management dashboard.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            <div>
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                placeholder="you@yourgym.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div>
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <a
                  href="#"
                  className="mb-1.5 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
                >
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  className="pr-11"
                />
                <button
                  type="button"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute top-1/2 right-3 -translate-y-1/2 rounded-md p-1 text-neutral-400 transition-colors hover:text-ink focus-visible:ring-2 focus-visible:ring-primary-500"
                >
                  {showPassword ? (
                    <EyeOff aria-hidden="true" className="size-4" />
                  ) : (
                    <Eye aria-hidden="true" className="size-4" />
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Checkbox id="remember" />
              <Label htmlFor="remember" className="mb-0 font-normal">
                Remember me
              </Label>
            </div>

            <Button type="submit" size="lg" fullWidth>
              Sign in
            </Button>
          </form>

          <div className="mt-6 rounded-lg border border-border bg-surface p-3.5">
            <p className="text-xs leading-relaxed text-neutral-500">
              Phase 0 foundation — real authentication will be enabled with
              Supabase Auth in Phase 1. This screen is ready to be wired up.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
