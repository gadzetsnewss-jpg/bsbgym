"use client";

import * as React from "react";
import { z } from "zod";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { FormSection } from "@/components/ui/form-section";
import { updateProfile } from "@/lib/auth/profile";
import { profileSchema } from "@/lib/validation/auth-schemas";

type ProfileValues = z.infer<typeof profileSchema>;

export function ProfileForm() {
  const { toast } = useToast();
  const { profile, updateProfileLocal } = useOrganization();

  const [values, setValues] = React.useState<ProfileValues>({
    firstName: profile?.firstName ?? "",
    lastName: profile?.lastName ?? "",
    phone: profile?.phone ?? "",
  });
  const [avatarUrl, setAvatarUrl] = React.useState(profile?.avatarUrl ?? "");
  const [errors, setErrors] = React.useState<Partial<Record<keyof ProfileValues, string>>>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    setValues({
      firstName: profile?.firstName ?? "",
      lastName: profile?.lastName ?? "",
      phone: profile?.phone ?? "",
    });
    setAvatarUrl(profile?.avatarUrl ?? "");
  }, [profile?.id, profile?.firstName, profile?.lastName, profile?.phone, profile?.avatarUrl]);

  if (!profile) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Profile</CardTitle>
        </CardHeader>
        <p className="text-sm text-neutral-500">
          Profile data is unavailable. Sign in to view and edit your profile.
        </p>
      </Card>
    );
  }

  const setField = (field: keyof ProfileValues, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (prev[field] ? { ...prev, [field]: undefined } : prev));
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const parsed = profileSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof ProfileValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof ProfileValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const result = await updateProfile({
      profileId: profile.id,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      avatarUrl: avatarUrl || null,
    });
    setSubmitting(false);

    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }

    updateProfileLocal({
      ...profile,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone || null,
      avatarUrl: avatarUrl || null,
    });
    setSaved(true);
    toast({ title: "Profile updated", description: "Your changes have been saved.", variant: "success" });
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="space-y-5">
      {saved && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
          Changes saved successfully.
        </div>
      )}

      <FormSection title="Personal information" description="How you appear across the app.">
        <FormField label="First name" required error={errors.firstName}>
          <Input
            autoComplete="given-name"
            value={values.firstName}
            invalid={Boolean(errors.firstName)}
            onChange={(event) => setField("firstName", event.target.value)}
          />
        </FormField>
        <FormField label="Last name" required error={errors.lastName}>
          <Input
            autoComplete="family-name"
            value={values.lastName}
            invalid={Boolean(errors.lastName)}
            onChange={(event) => setField("lastName", event.target.value)}
          />
        </FormField>
        <FormField label="Phone" error={errors.phone}>
          <Input
            type="tel"
            autoComplete="tel"
            placeholder="+91 90000 00000"
            value={values.phone}
            invalid={Boolean(errors.phone)}
            onChange={(event) => setField("phone", event.target.value)}
          />
        </FormField>
        <FormField
          label="Avatar URL"
          hint="Link to an image (e.g. Gravatar). Avatar uploads arrive with Supabase Storage in a later phase."
        >
          <Input
            type="url"
            placeholder="https://…/avatar.png"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
          />
        </FormField>
      </FormSection>

      <FormSection title="Email" description="Your sign-in email is managed by your account provider.">
        <div>
          <p className="text-sm font-medium text-ink">Email address</p>
          <p className="mt-0.5 text-sm text-neutral-500">{profile.email ?? "—"}</p>
          <p className="mt-1.5 text-xs text-neutral-400">
            To change your email, contact support or update it through Supabase Auth.
          </p>
        </div>
      </FormSection>

      <div className="flex items-center justify-end gap-3">
        <Button type="submit" isLoading={submitting}>
          Save changes
        </Button>
      </div>
    </form>
  );
}
