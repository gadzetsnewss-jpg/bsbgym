"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice, PasswordInput } from "@/components/auth/password-input";
import { changePasswordSchema } from "@/lib/validation/auth-schemas";

type ChangeValues = z.infer<typeof changePasswordSchema>;

export default function ChangePasswordPage() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, completePasswordChange, signOut } = useAuth();
  const [values, setValues] = React.useState<ChangeValues>({ password: "", confirmPassword: "" });
  const [errors, setErrors] = React.useState<Partial<Record<keyof ChangeValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  const setField = (field: keyof ChangeValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = changePasswordSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ChangeValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ChangeValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const result = await completePasswordChange(parsed.data.password, parsed.data.confirmPassword);
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error.message);
      return;
    }

    toast({
      title: "Password updated",
      description: "Use your ID and new password next time.",
      variant: "success",
    });
    router.replace("/dashboard");
    router.refresh();
  };

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">Change your password</h2>
        <p className="mt-1 text-sm text-neutral-500">
          Your first password is the registered mobile number. Choose a new password before continuing.
        </p>
      </div>

      {!configured && <NotConfiguredNotice className="mb-5" />}

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
            disabled={!configured}
          />
        </FormField>

        <FormField label="Confirm password" required error={errors.confirmPassword}>
          <PasswordInput
            autoComplete="new-password"
            placeholder="Re-enter your new password"
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

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={!configured || submitting}>
          Save password
        </Button>
      </form>

      <p className="mt-6 text-center text-sm text-neutral-500">
        <button
          type="button"
          className="font-medium text-primary-700 transition-colors hover:text-primary-800"
          onClick={() => {
            void signOut().then(() => {
              router.replace("/login");
              router.refresh();
            });
          }}
        >
          Sign out
        </button>
      </p>
    </React.Fragment>
  );
}
