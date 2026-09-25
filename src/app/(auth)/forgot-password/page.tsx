"use client";

import * as React from "react";
import Link from "next/link";
import { ArrowLeft, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice } from "@/components/auth/password-input";
import { forgotPasswordSchema } from "@/lib/validation/auth-schemas";

export default function ForgotPasswordPage() {
  const { toast } = useToast();
  const { configured, sendPasswordReset } = useAuth();

  const [username, setUsername] = React.useState("");
  const [error, setError] = React.useState<string | undefined>(undefined);
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = forgotPasswordSchema.safeParse({ username });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await sendPasswordReset(parsed.data.username);
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error.message);
      return;
    }

    setSent(true);
    toast({
      title: "Reset link sent",
      description: "If an account exists, a password reset link is on its way.",
      variant: "success",
    });
  };

  if (sent) {
    return (
      <div className="flex flex-col items-center text-center">
        <div className="mb-4 flex size-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
          <MailCheck aria-hidden="true" className="size-6" />
        </div>
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Check your inbox</h2>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          If an account exists for <span className="font-medium text-ink">{username}</span>,
          a password reset link has been sent. The link expires shortly.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Back to sign in
        </Link>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Reset your password</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Enter your username and we&apos;ll send a reset link if an account exists.
        </p>
      </div>

      {!configured && <NotConfiguredNotice className="mb-5" />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField label="Username" required error={error}>
          <Input
            autoComplete="username"
            placeholder="your.username"
            invalid={Boolean(error)}
            value={username}
            onChange={(event) => {
              setUsername(event.target.value);
              setError(undefined);
              setFormError(null);
            }}
            disabled={!configured}
          />
        </FormField>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={!configured || submitting}>
          Send reset link
        </Button>
      </form>

      <Link
        href="/login"
        className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-primary-700 transition-colors hover:text-primary-800"
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Back to sign in
      </Link>
    </React.Fragment>
  );
}
