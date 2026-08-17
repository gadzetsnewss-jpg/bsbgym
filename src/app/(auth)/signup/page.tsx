"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice, PasswordInput } from "@/components/auth/password-input";
import { signUpSchema } from "@/lib/validation/auth-schemas";

type SignUpValues = z.infer<typeof signUpSchema>;

export default function SignUpPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, signUp } = useAuth();

  const [values, setValues] = React.useState<SignUpValues>({
    firstName: "",
    lastName: "",
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [errors, setErrors] = React.useState<Partial<Record<keyof SignUpValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const setField = (field: keyof SignUpValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = signUpSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof SignUpValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof SignUpValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await signUp({
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      password: parsed.data.password,
    });

    setSubmitting(false);

    if (result.error) {
      setFormError(result.error.message);
      return;
    }

    if (result.data?.sessionCreated) {
      toast({
        title: "Account created",
        description: "Welcome to BSB FitForge. Setting up your workspace…",
        variant: "success",
      });
      router.replace("/onboarding");
      router.refresh();
      return;
    }

    // Email confirmation required - user must verify before signing in.
    toast({
      title: "Check your inbox",
      description: "We sent a confirmation link to your email address.",
      variant: "info",
    });
    router.replace("/login?verified=email");
  };

  const disabled = !configured || submitting;

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Create your account</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Set up your gym workspace in a few minutes.
        </p>
      </div>

      {!configured && <NotConfiguredNotice className="mb-5" />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FormField label="First name" required error={errors.firstName}>
            <Input
              autoComplete="given-name"
              placeholder="Aarav"
              invalid={Boolean(errors.firstName)}
              value={values.firstName}
              onChange={(event) => setField("firstName", event.target.value)}
              disabled={!configured}
            />
          </FormField>

          <FormField label="Last name" required error={errors.lastName}>
            <Input
              autoComplete="family-name"
              placeholder="Mehta"
              invalid={Boolean(errors.lastName)}
              value={values.lastName}
              onChange={(event) => setField("lastName", event.target.value)}
              disabled={!configured}
            />
          </FormField>
        </div>

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

        <FormField
          label="Password"
          required
          hint="At least 8 characters with letters and numbers."
          error={errors.password}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Create a strong password"
            invalid={Boolean(errors.password)}
            value={values.password}
            onChange={(event) => setField("password", event.target.value)}
            disabled={!configured}
          />
        </FormField>

        <FormField label="Confirm password" required error={errors.confirmPassword}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Re-enter your password"
            invalid={Boolean(errors.confirmPassword)}
            value={values.confirmPassword}
            onChange={(event) => setField("confirmPassword", event.target.value)}
            disabled={!configured}
          />
        </FormField>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={disabled}>
          Create account
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-primary-700 transition-colors hover:text-primary-800">
          Sign in
        </Link>
      </p>
    </React.Fragment>
  );
}
