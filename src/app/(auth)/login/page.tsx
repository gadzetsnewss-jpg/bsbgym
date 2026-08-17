"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice, PasswordInput } from "@/components/auth/password-input";
import { useQueryParam } from "@/hooks/use-query-param";
import { loginSchema } from "@/lib/validation/auth-schemas";

type LoginValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, signIn } = useAuth();
  const next = useQueryParam("next");

  const [values, setValues] = React.useState<LoginValues>({ email: "", password: "" });
  const [errors, setErrors] = React.useState<Partial<Record<keyof LoginValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [remember, setRemember] = React.useState(false);

  const setField = (field: keyof LoginValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = loginSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof LoginValues, string>> = {};
      for (const issue of parsed.error.issues) {
        if (issue.path[0] && !fieldErrors[issue.path[0] as keyof LoginValues]) {
          fieldErrors[issue.path[0] as keyof LoginValues] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await signIn(parsed.data.email, parsed.data.password);
    setSubmitting(false);

    if (result.error) {
      const message =
        result.error.message.toLowerCase().includes("email not confirmed")
          ? "Please confirm your email address before signing in."
          : result.error.message;
      setFormError(message);
      return;
    }

    toast({ title: "Welcome back", description: "Signing you in…", variant: "success" });
    router.replace(next && next.startsWith("/") ? next : "/dashboard");
    router.refresh();
  };

  const disabled = !configured || submitting;

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Welcome back</h2>
        <p className="mt-1 text-sm text-neutral-500">Sign in to your gym management dashboard.</p>
      </div>

      {!configured && <NotConfiguredNotice className="mb-5" />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Email address" required error={errors.email}>
          <Input
            type="email"
            autoComplete="email"
            placeholder="you@yourgym.com"
            invalid={Boolean(errors.email)}
            value={values.email}
            onChange={(event) => setField("email", event.target.value)}
            disabled={!configured}
          />
        </FormField>

        <div>
          <div className="flex items-center justify-between">
            <label
              htmlFor="password"
              className="mb-1.5 block text-sm font-medium text-ink"
            >
              Password
            </label>
            <Link
              href="/forgot-password"
              className="mb-1.5 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
            >
              Forgot password?
            </Link>
          </div>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            invalid={Boolean(errors.password)}
            aria-describedby={errors.password ? "password-error" : undefined}
            value={values.password}
            onChange={(event) => setField("password", event.target.value)}
            disabled={!configured}
          />
          {errors.password && (
            <p id="password-error" role="alert" className="mt-1.5 text-xs font-medium text-red-600">
              {errors.password}
            </p>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Checkbox
            id="remember"
            checked={remember}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <label htmlFor="remember" className="text-sm font-normal text-neutral-600">
            Remember me
          </label>
        </div>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={disabled}>
          Sign in
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        New to BSB FitForge?{" "}
        <Link href="/signup" className="font-medium text-primary-700 transition-colors hover:text-primary-800">
          Create an account
        </Link>
      </p>
    </React.Fragment>
  );
}
