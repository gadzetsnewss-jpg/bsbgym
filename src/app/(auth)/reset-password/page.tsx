"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice, PasswordInput } from "@/components/auth/password-input";
import { useQueryParam } from "@/hooks/use-query-param";
import { getSessionUser, exchangeCodeForSession } from "@/lib/auth/session";
import { resetPasswordSchema } from "@/lib/validation/auth-schemas";

type ResetValues = z.infer<typeof resetPasswordSchema>;

export default function ResetPasswordPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, updatePassword } = useAuth();
  const code = useQueryParam("code");

  const [sessionReady, setSessionReady] = React.useState(false);
  const [linkError, setLinkError] = React.useState<string | null>(null);
  const [values, setValues] = React.useState<ResetValues>({ password: "", confirmPassword: "" });
  const [errors, setErrors] = React.useState<Partial<Record<keyof ResetValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  // Establish the session from the email link (PKCE `?code=` or existing session).
  React.useEffect(() => {
    if (!configured) {
      setLinkError("Supabase is not configured.");
      return;
    }
    if (sessionReady) return;

    let active = true;
    void (async () => {
      const current = await getSessionUser();
      if (active && current) {
        setSessionReady(true);
        return;
      }
      if (code) {
        const result = await exchangeCodeForSession(code);
        if (active && result.error) {
          setLinkError(result.error.message);
        } else if (active) {
          setSessionReady(true);
        }
      } else if (active) {
        setLinkError("This reset link is invalid or has expired.");
      }
    })();

    return () => {
      active = false;
    };
  }, [configured, code, sessionReady]);

  const setField = (field: keyof ResetValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = resetPasswordSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ResetValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ResetValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await updatePassword(parsed.data.password);
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error.message);
      return;
    }

    toast({
      title: "Password updated",
      description: "You can now sign in with your new password.",
      variant: "success",
    });
    router.replace("/login");
  };

  if (!configured) {
    return (
      <React.Fragment>
        <h2 className="mb-6 text-2xl font-semibold tracking-tight text-ink">Reset your password</h2>
        <NotConfiguredNotice />
      </React.Fragment>
    );
  }

  if (linkError) {
    return (
      <div className="text-center">
        <h2 className="mb-2 text-2xl font-semibold tracking-tight text-ink">Link unavailable</h2>
        <p className="text-sm leading-relaxed text-neutral-500">{linkError}</p>
        <Button variant="outline" className="mt-6" onClick={() => router.replace("/forgot-password")}>
          Request a new link
        </Button>
      </div>
    );
  }

  if (!sessionReady) {
    return (
      <div className="flex flex-col items-center py-10 text-center">
        <LoaderCircle aria-hidden="true" className="size-6 animate-spin text-primary-600" />
        <p className="mt-3 text-sm text-neutral-500">Validating your reset link…</p>
      </div>
    );
  }

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Choose a new password</h2>
        <p className="mt-1 text-sm text-neutral-500">Your identity has been verified.</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <FormField
          label="New password"
          required
          hint="At least 8 characters with letters and numbers."
          error={errors.password}
        >
          <PasswordInput
            autoComplete="new-password"
            placeholder="Enter a new password"
            invalid={Boolean(errors.password)}
            value={values.password}
            onChange={(event) => setField("password", event.target.value)}
          />
        </FormField>

        <FormField label="Confirm password" required error={errors.confirmPassword}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Re-enter your new password"
            invalid={Boolean(errors.confirmPassword)}
            value={values.confirmPassword}
            onChange={(event) => setField("confirmPassword", event.target.value)}
          />
        </FormField>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth isLoading={submitting}>
          Update password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        Remembered it?{" "}
        <Link href="/login" className="font-medium text-primary-700 transition-colors hover:text-primary-800">
          Sign in
        </Link>
      </p>
    </React.Fragment>
  );
}
