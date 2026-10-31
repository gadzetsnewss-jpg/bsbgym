"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice, PasswordInput } from "@/components/auth/password-input";
import { useQueryParam } from "@/hooks/use-query-param";
import { portalLoginSchema, type PortalRole } from "@/lib/validation/auth-schemas";
import { PORTAL_HOME } from "@/lib/auth/portals";

const COPY: Record<
  PortalRole,
  { title: string; description: string; idLabel: string; idPlaceholder: string }
> = {
  owner: {
    title: "Owner sign in",
    description: "Sign in with your username and password.",
    idLabel: "Username",
    idPlaceholder: "your.username",
  },
  trainer: {
    title: "Trainer sign in",
    description: "Enter your gym code, trainer ID and password.",
    idLabel: "Trainer ID",
    idPlaceholder: "TR-0001",
  },
  member: {
    title: "Member sign in",
    description: "Enter your gym code, member code and password.",
    idLabel: "Member Code",
    idPlaceholder: "MEM-0001",
  },
};

export function PortalLoginForm({ portal }: { portal: PortalRole }) {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, signIn } = useAuth();
  const next = useQueryParam("next");
  const gymFromQuery = useQueryParam("gym");
  const copy = COPY[portal];
  const needsGym = portal === "trainer" || portal === "member";

  const [values, setValues] = React.useState({ gymCode: "", id: "", password: "" });
  const [errors, setErrors] = React.useState<Partial<Record<"gymCode" | "id" | "password", string>>>(
    {},
  );
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!needsGym || !gymFromQuery) return;
    setValues((prev) => (prev.gymCode ? prev : { ...prev, gymCode: gymFromQuery }));
  }, [gymFromQuery, needsGym]);

  const setField = (field: "gymCode" | "id" | "password", value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!configured || submitting) return;

    const parsed = portalLoginSchema.safeParse({
      id: values.id,
      password: values.password,
      portal,
      ...(needsGym ? { gymCode: values.gymCode } : {}),
    });
    if (!parsed.success) {
      const fieldErrors: Partial<Record<"gymCode" | "id" | "password", string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if ((key === "gymCode" || key === "id" || key === "password") && !fieldErrors[key]) {
          fieldErrors[key] = issue.message;
        }
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    setFormError(null);

    const result = await signIn(
      parsed.data.id,
      parsed.data.password,
      portal,
      needsGym ? parsed.data.gymCode : undefined,
    );
    setSubmitting(false);

    if (result.error) {
      setFormError(result.error.message);
      return;
    }

    toast({ title: "Welcome back", description: "Signing you in…", variant: "success" });
    router.replace(next && next.startsWith("/") ? next : PORTAL_HOME[portal]);
    router.refresh();
  };

  const disabled = !configured || submitting;

  return (
    <React.Fragment>
      <div className="mb-6">
        <h2 className="text-2xl font-semibold tracking-tight text-ink">{copy.title}</h2>
        <p className="mt-1 text-sm text-neutral-500">{copy.description}</p>
      </div>

      {!configured && <NotConfiguredNotice className="mb-5" />}

      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {needsGym && (
          <FormField
            label="Gym code"
            required
            hint="Your gym workspace slug from Settings > Organization."
            error={errors.gymCode}
          >
            <Input
              autoComplete="organization"
              placeholder="your-gym"
              invalid={Boolean(errors.gymCode)}
              value={values.gymCode}
              onChange={(event) => setField("gymCode", event.target.value)}
              disabled={!configured}
            />
          </FormField>
        )}

        <FormField label={copy.idLabel} required error={errors.id}>
          <Input
            autoComplete="username"
            placeholder={copy.idPlaceholder}
            invalid={Boolean(errors.id)}
            value={values.id}
            onChange={(event) => setField("id", event.target.value)}
            disabled={!configured}
          />
        </FormField>

        <FormField label="Password" required error={errors.password}>
          <PasswordInput
            id="password"
            autoComplete="current-password"
            placeholder="Enter your password"
            invalid={Boolean(errors.password)}
            value={values.password}
            onChange={(event) => setField("password", event.target.value)}
            disabled={!configured}
          />
        </FormField>

        {formError && (
          <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {formError}
          </p>
        )}

        <Button type="submit" size="lg" fullWidth isLoading={submitting} disabled={disabled}>
          Sign in
        </Button>
      </form>
    </React.Fragment>
  );
}
