"use client";

import * as React from "react";
import { z } from "zod";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { FormSection } from "@/components/ui/form-section";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { EmptyState } from "@/components/ui/empty-state";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { AddressFields, ContactFields } from "@/components/onboarding/fields";
import { fetchBusinessTypes, type BusinessTypeOption } from "@/lib/org/members";
import { updateOrganization } from "@/lib/org/settings";
import {
  organizationSettingsSchema,
  CURRENCIES,
  DATE_FORMATS,
  TIMEZONES,
} from "@/lib/validation/auth-schemas";

type OrgValues = z.infer<typeof organizationSettingsSchema>;

function emptyValues(): OrgValues {
  return {
    name: "",
    legalName: "",
    businessType: "",
    email: "",
    phone: "",
    website: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    taxId: "",
    gstin: "",
    currency: "INR",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
    logoUrl: "",
  };
}

export function OrganizationForm() {
  const { toast } = useToast();
  const { organization, updateOrganizationLocal, can } = useOrganization();
  const canManage = can("organization.manage");

  const [values, setValues] = React.useState<OrgValues>(emptyValues);
  const [errors, setErrors] = React.useState<Partial<Record<keyof OrgValues, string>>>({});
  const [types, setTypes] = React.useState<BusinessTypeOption[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [saved, setSaved] = React.useState(false);

  React.useEffect(() => {
    if (!organization) return;
    setValues({
      name: organization.name,
      legalName: organization.legalName ?? "",
      businessType: organization.businessType ?? "",
      email: organization.email ?? "",
      phone: organization.phone ?? "",
      website: organization.website ?? "",
      addressLine1: organization.addressLine1 ?? "",
      addressLine2: organization.addressLine2 ?? "",
      city: organization.city ?? "",
      state: organization.state ?? "",
      postalCode: organization.postalCode ?? "",
      country: organization.country ?? "",
      taxId: organization.taxId ?? "",
      gstin: organization.gstin ?? "",
      currency: organization.currency,
      timezone: organization.timezone,
      dateFormat: organization.dateFormat,
      logoUrl: organization.logoUrl ?? "",
    });
  }, [organization]);

  React.useEffect(() => {
    void fetchBusinessTypes().then((result) => {
      if (result.data) setTypes(result.data);
    });
  }, []);

  if (!organization) {
    return (
      <div className="space-y-6">
        <PageHeader
          title="Organization"
          description="Gym organization profile."
        />
        <EmptyState
          title="Organization unavailable"
          description="Sign in with an organization to view and edit this profile."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  const setField = (field: string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) =>
      field in prev ? { ...prev, [field]: undefined } : prev,
    );
    setSaved(false);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || !canManage) return;

    const parsed = organizationSettingsSchema.safeParse(values);
    if (!parsed.success) {
      const fieldErrors: Partial<Record<keyof OrgValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof OrgValues | undefined;
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setSubmitting(true);
    const result = await updateOrganization({
      organizationId: organization.id,
      ...parsed.data,
    });
    setSubmitting(false);

    if (result.error) {
      toast({ title: "Could not save", description: result.error.message, variant: "error" });
      return;
    }

    updateOrganizationLocal({
      ...organization,
      name: parsed.data.name,
      legalName: parsed.data.legalName || null,
      businessType: parsed.data.businessType || null,
      email: parsed.data.email || null,
      phone: parsed.data.phone || null,
      website: parsed.data.website || null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      postalCode: parsed.data.postalCode || null,
      country: parsed.data.country || null,
      taxId: parsed.data.taxId || null,
      gstin: parsed.data.gstin || null,
      currency: parsed.data.currency,
      timezone: parsed.data.timezone,
      dateFormat: parsed.data.dateFormat,
      logoUrl: parsed.data.logoUrl || null,
    });
    setSaved(true);
    toast({ title: "Organization updated", description: "Your changes have been saved.", variant: "success" });
  };

  const typeOptions = [
    { value: "", label: "Select a business type" },
    ...types.map((item) => ({ value: item.code, label: item.label })),
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Organization"
        description="Gym organization profile, GSTIN and regional defaults."
      />

      {!canManage && (
        <Card>
          <CardHeader>
            <CardTitle>View only</CardTitle>
          </CardHeader>
          <p className="text-sm text-neutral-500">
            Only the organization owner can change these details.
          </p>
        </Card>
      )}

      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        {saved && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
            Changes saved successfully.
          </div>
        )}

        <FormSection title="Business" description="How your gym appears across the product.">
          <FormField label="Business name" required error={errors.name}>
            <Input
              value={values.name}
              invalid={Boolean(errors.name)}
              onChange={(event) => setField("name", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Legal name" error={errors.legalName}>
            <Input
              value={values.legalName ?? ""}
              invalid={Boolean(errors.legalName)}
              onChange={(event) => setField("legalName", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Business type" error={errors.businessType}>
            <Select
              options={typeOptions}
              value={values.businessType ?? ""}
              invalid={Boolean(errors.businessType)}
              onChange={(event) => setField("businessType", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField
            label="Workspace slug"
            hint="Generated from the name when the organization was created. It cannot be changed here."
          >
            <Input value={organization.slug} disabled readOnly />
          </FormField>
          <FormField label="GSTIN" error={errors.gstin} hint="15-character GST identification number.">
            <Input
              value={values.gstin ?? ""}
              invalid={Boolean(errors.gstin)}
              onChange={(event) => setField("gstin", event.target.value.toUpperCase())}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Tax ID" error={errors.taxId}>
            <Input
              value={values.taxId ?? ""}
              invalid={Boolean(errors.taxId)}
              onChange={(event) => setField("taxId", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
        </FormSection>

        <FormSection title="Contact" description="Public contact details for this organization." columns={1}>
          <ContactFields
            values={values as Record<string, string>}
            errors={errors as Record<string, string | undefined>}
            onChange={setField}
            disabled={!canManage}
            withWebsite
          />
        </FormSection>

        <FormSection title="Address" description="Registered business address." columns={1}>
          <AddressFields
            values={values as Record<string, string>}
            errors={errors as Record<string, string | undefined>}
            onChange={setField}
            disabled={!canManage}
          />
        </FormSection>

        <FormSection title="Regional defaults" description="Used as the default for invoices, reports and new branches.">
          <FormField label="Currency" required error={errors.currency}>
            <Select
              options={[...CURRENCIES]}
              value={values.currency}
              invalid={Boolean(errors.currency)}
              onChange={(event) => setField("currency", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Timezone" required error={errors.timezone}>
            <Select
              options={[...TIMEZONES]}
              value={values.timezone}
              invalid={Boolean(errors.timezone)}
              onChange={(event) => setField("timezone", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
          <FormField label="Date format" required error={errors.dateFormat}>
            <Select
              options={[...DATE_FORMATS]}
              value={values.dateFormat}
              invalid={Boolean(errors.dateFormat)}
              onChange={(event) => setField("dateFormat", event.target.value)}
              disabled={!canManage}
            />
          </FormField>
        </FormSection>

        {canManage && (
          <div className="flex items-center justify-end gap-3">
            <Button type="submit" isLoading={submitting}>
              Save changes
            </Button>
          </div>
        )}
      </form>
    </div>
  );
}
