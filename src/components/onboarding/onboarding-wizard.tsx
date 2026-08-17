"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { z } from "zod";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSection } from "@/components/ui/form-section";
import { useToast } from "@/components/ui/toast";
import { useAuth } from "@/components/auth/auth-provider";
import { NotConfiguredNotice } from "@/components/auth/password-input";
import { Stepper } from "@/components/onboarding/stepper";
import { AddressFields, ContactFields, TimezoneField } from "@/components/onboarding/fields";
import {
  accountSchema,
  businessInfoSchema,
  branchSchema,
  preferencesSchema,
  CURRENCIES,
  DATE_FORMATS,
  TIMEZONES,
} from "@/lib/validation/auth-schemas";
import { fetchBusinessTypes, type BusinessTypeOption } from "@/lib/org/members";
import { createOrganization, type CreateOrganizationInput } from "@/lib/org/onboarding";

const STEPS = ["Account", "Business", "Branch", "Preferences", "Complete"] as const;

interface WizardState {
  account: Record<string, string>;
  business: Record<string, string>;
  branch: Record<string, string>;
  preferences: Record<string, string>;
}

const EMPTY_STATE: WizardState = {
  account: { firstName: "", lastName: "" },
  business: {
    name: "",
    legalName: "",
    businessType: "",
    email: "",
    phone: "",
    website: "",
    taxId: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  },
  branch: {
    name: "",
    code: "",
    phone: "",
    email: "",
    timezone: "Asia/Kolkata",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  },
  preferences: {
    currency: "INR",
    timezone: "Asia/Kolkata",
    dateFormat: "DD/MM/YYYY",
  },
};

type StepKey = keyof WizardState;

const STEP_SCHEMAS: Record<StepKey, z.ZodTypeAny> = {
  account: accountSchema,
  business: businessInfoSchema,
  branch: branchSchema,
  preferences: preferencesSchema,
};

const STEP_TITLES = [
  { title: "Your account", description: "We use this to personalize your workspace." },
  { title: "Business information", description: "Tell us about your fitness business." },
  { title: "First branch", description: "Create the branch you operate from today." },
  { title: "Preferences", description: "Regional and display preferences for your workspace." },
  { title: "You're all set", description: "Review your details and create your workspace." },
];

export function OnboardingWizard() {
  const { toast } = useToast();
  const router = useRouter();
  const { configured, user } = useAuth();

  const [step, setStep] = React.useState(0);
  const [data, setData] = React.useState<WizardState>(EMPTY_STATE);
  const [errors, setErrors] = React.useState<Record<string, Record<string, string | undefined>>>({});
  const [businessTypes, setBusinessTypes] = React.useState<BusinessTypeOption[]>([]);
  const [submitting, setSubmitting] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  React.useEffect(() => {
    setData((prev) => ({
      ...prev,
      account: {
        firstName: prev.account.firstName || user?.firstName || "",
        lastName: prev.account.lastName || user?.lastName || "",
      },
    }));
  }, [user?.firstName, user?.lastName]);

  React.useEffect(() => {
    if (!configured) return;
    void fetchBusinessTypes().then((result) => {
      if (!result.error) setBusinessTypes(result.data);
    });
  }, [configured]);

  const currentKey = STEPS[step].toLowerCase() as StepKey;
  const currentValues = data[currentKey];

  const updateField = (field: string, value: string) => {
    setData((prev) => ({
      ...prev,
      [currentKey]: { ...prev[currentKey], [field]: value },
    }));
    setErrors((prev) => {
      const next = { ...prev };
      if (next[currentKey]?.[field]) {
        next[currentKey] = { ...next[currentKey], [field]: undefined };
      }
      return next;
    });
    setSubmitError(null);
  };

  const handleNext = () => {
    if (step >= STEPS.length - 1) return;
    const parsed = STEP_SCHEMAS[currentKey].safeParse(currentValues);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "");
        if (key && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors((prev) => ({ ...prev, [currentKey]: fieldErrors }));
      return;
    }
    setErrors((prev) => ({ ...prev, [currentKey]: {} }));
    setStep((prev) => prev + 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleBack = () => {
    if (step === 0) return;
    setStep((prev) => prev - 1);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async () => {
    if (!configured || submitting) return;

    // Validate the final review against all step schemas.
    for (const key of ["account", "business", "branch", "preferences"] as StepKey[]) {
      const parsed = STEP_SCHEMAS[key].safeParse(data[key]);
      if (!parsed.success) {
        setStep(["account", "business", "branch", "preferences"].indexOf(key));
        toast({
          title: "Missing details",
          description: "Some required fields are incomplete.",
          variant: "warning",
        });
        return;
      }
    }

    setSubmitting(true);
    setSubmitError(null);

    const input: CreateOrganizationInput = {
      name: data.business.name,
      legalName: data.business.legalName || undefined,
      businessType: data.business.businessType || undefined,
      email: data.business.email || undefined,
      phone: data.business.phone || undefined,
      website: data.business.website || undefined,
      taxId: data.business.taxId || undefined,
      currency: data.preferences.currency,
      timezone: data.preferences.timezone,
      dateFormat: data.preferences.dateFormat,
      address: {
        addressLine1: data.business.addressLine1 || undefined,
        addressLine2: data.business.addressLine2 || undefined,
        city: data.business.city || undefined,
        state: data.business.state || undefined,
        postalCode: data.business.postalCode || undefined,
        country: data.business.country || undefined,
      },
      branch: {
        name: data.branch.name,
        code: data.branch.code,
        phone: data.branch.phone || undefined,
        email: data.branch.email || undefined,
        timezone: data.branch.timezone,
        address: {
          addressLine1: data.branch.addressLine1 || undefined,
          addressLine2: data.branch.addressLine2 || undefined,
          city: data.branch.city || undefined,
          state: data.branch.state || undefined,
          postalCode: data.branch.postalCode || undefined,
          country: data.branch.country || undefined,
        },
      },
    };

    const result = await createOrganization(input);
    setSubmitting(false);

    if (result.error) {
      setSubmitError(result.error.message);
      return;
    }

    setDone(true);
    toast({
      title: "Workspace created",
      description: "Your organization is ready. Setting up your dashboard…",
      variant: "success",
    });
    window.setTimeout(() => {
      router.replace("/dashboard");
      router.refresh();
    }, 1200);
  };

  if (done) {
    return (
      <Card className="mx-auto w-full max-w-lg p-8 text-center">
        <CheckCircle2 aria-hidden="true" className="mx-auto mb-4 size-12 text-emerald-500" />
        <h1 className="text-xl font-semibold tracking-tight text-ink">Your workspace is ready</h1>
        <p className="mt-2 text-sm text-neutral-500">
          We&apos;re taking you to your dashboard…
        </p>
      </Card>
    );
  }

  const stepInfo = STEP_TITLES[step];
  const stepErrors = errors[currentKey] ?? {};

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight text-ink">
          Set up your workspace
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          A few quick steps to get BSB FitForge running for your gym.
        </p>
      </div>

      <Stepper steps={STEPS} current={step} />

      <Card className="mt-6 p-6 sm:p-8">
        <div className="mb-6">
          <h2 className="text-lg font-semibold tracking-tight text-ink">{stepInfo.title}</h2>
          <p className="mt-0.5 text-sm text-neutral-500">{stepInfo.description}</p>
        </div>

        {!configured && <NotConfiguredNotice className="mb-5" />}

        {step === 0 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="First name" required error={stepErrors.firstName}>
              <Input
                autoComplete="given-name"
                value={data.account.firstName}
                invalid={Boolean(stepErrors.firstName)}
                onChange={(event) => updateField("firstName", event.target.value)}
                disabled={!configured}
              />
            </FormField>
            <FormField label="Last name" required error={stepErrors.lastName}>
              <Input
                autoComplete="family-name"
                value={data.account.lastName}
                invalid={Boolean(stepErrors.lastName)}
                onChange={(event) => updateField("lastName", event.target.value)}
                disabled={!configured}
              />
            </FormField>
          </div>
        )}

        {step === 1 && (
          <div className="space-y-5">
            <FormSection title="Business details" columns={2}>
              <FormField label="Business name" required error={stepErrors.name}>
                <Input
                  placeholder="e.g. BSB FitForge"
                  value={data.business.name}
                  invalid={Boolean(stepErrors.name)}
                  onChange={(event) => updateField("name", event.target.value)}
                  disabled={!configured}
                />
              </FormField>
              <FormField label="Legal name" error={stepErrors.legalName}>
                <Input
                  placeholder="Registered legal name (optional)"
                  value={data.business.legalName}
                  invalid={Boolean(stepErrors.legalName)}
                  onChange={(event) => updateField("legalName", event.target.value)}
                  disabled={!configured}
                />
              </FormField>
              <div className="sm:col-span-2">
                <FormField label="Business type" error={stepErrors.businessType}>
                  <Select
                    placeholder="Select a business type"
                    options={businessTypes.map((type) => ({ value: type.code, label: type.label }))}
                    value={data.business.businessType}
                    invalid={Boolean(stepErrors.businessType)}
                    onChange={(event) => updateField("businessType", event.target.value)}
                    disabled={!configured}
                  />
                </FormField>
              </div>
            </FormSection>

            <FormSection title="Contact" columns={2}>
              <ContactFields
                values={data.business}
                errors={stepErrors}
                onChange={updateField}
                disabled={!configured}
                withWebsite
              />
            </FormSection>

            <FormSection title="Location" columns={2}>
              <AddressFields
                values={data.business}
                errors={stepErrors}
                onChange={updateField}
                disabled={!configured}
              />
            </FormSection>

            <FormSection title="Tax / GST" columns={2}>
              <FormField
                label="Tax / GST ID"
                hint="Your registration number, shown on invoices."
                error={stepErrors.taxId}
              >
                <Input
                  placeholder="e.g. GSTIN 27AAAAA0000A1Z5"
                  value={data.business.taxId}
                  invalid={Boolean(stepErrors.taxId)}
                  onChange={(event) => updateField("taxId", event.target.value)}
                  disabled={!configured}
                />
              </FormField>
            </FormSection>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <FormSection title="Branch identity" columns={2}>
              <FormField label="Branch name" required error={stepErrors.name}>
                <Input
                  placeholder="e.g. BSB FitForge Main"
                  value={data.branch.name}
                  invalid={Boolean(stepErrors.name)}
                  onChange={(event) => updateField("name", event.target.value)}
                  disabled={!configured}
                />
              </FormField>
              <FormField
                label="Branch code"
                required
                hint="A short unique code, e.g. MAIN"
                error={stepErrors.code}
              >
                <Input
                  placeholder="MAIN"
                  value={data.branch.code}
                  invalid={Boolean(stepErrors.code)}
                  onChange={(event) => updateField("code", event.target.value)}
                  disabled={!configured}
                />
              </FormField>
            </FormSection>

            <FormSection title="Contact & timezone" columns={2}>
              <ContactFields
                values={data.branch}
                errors={stepErrors}
                onChange={updateField}
                disabled={!configured}
              />
              <TimezoneField
                values={data.branch}
                errors={stepErrors}
                onChange={updateField}
                disabled={!configured}
              />
            </FormSection>

            <FormSection title="Location" columns={2}>
              <AddressFields
                values={data.branch}
                errors={stepErrors}
                onChange={updateField}
                disabled={!configured}
              />
            </FormSection>
          </div>
        )}

        {step === 3 && (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <FormField label="Currency" required error={stepErrors.currency}>
              <Select
                options={[...CURRENCIES]}
                value={data.preferences.currency}
                invalid={Boolean(stepErrors.currency)}
                onChange={(event) => updateField("currency", event.target.value)}
                disabled={!configured}
              />
            </FormField>
            <FormField label="Timezone" required error={stepErrors.timezone}>
              <Select
                options={[...TIMEZONES]}
                value={data.preferences.timezone}
                invalid={Boolean(stepErrors.timezone)}
                onChange={(event) => updateField("timezone", event.target.value)}
                disabled={!configured}
              />
            </FormField>
            <FormField label="Date format" required error={stepErrors.dateFormat}>
              <Select
                options={[...DATE_FORMATS]}
                value={data.preferences.dateFormat}
                invalid={Boolean(stepErrors.dateFormat)}
                onChange={(event) => updateField("dateFormat", event.target.value)}
                disabled={!configured}
              />
            </FormField>
          </div>
        )}

        {step === 4 && (
          <dl className="grid grid-cols-1 gap-x-8 gap-y-4 sm:grid-cols-2">
            <ReviewItem label="Account" value={`${data.account.firstName} ${data.account.lastName}`} />
            <ReviewItem label="Business" value={data.business.name} />
            <ReviewItem label="Business type" value={businessTypes.find((t) => t.code === data.business.businessType)?.label ?? (data.business.businessType || "—")} />
            <ReviewItem label="First branch" value={`${data.branch.name} (${data.branch.code})`} />
            <ReviewItem label="Currency" value={data.preferences.currency} />
            <ReviewItem label="Timezone" value={data.preferences.timezone} />
            <ReviewItem label="Date format" value={data.preferences.dateFormat} />
            <ReviewItem label="Tax / GST ID" value={data.business.taxId || "—"} />
          </dl>
        )}

        {submitError && (
          <p role="alert" className="mt-5 rounded-lg border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-medium text-red-600">
            {submitError}
          </p>
        )}

        <div className="mt-8 flex items-center justify-between gap-3">
          <Button
            variant="outline"
            onClick={handleBack}
            disabled={step === 0 || submitting}
          >
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back
          </Button>

          {step < STEPS.length - 1 ? (
            <Button onClick={handleNext} disabled={!configured}>
              Continue
              <ArrowRight aria-hidden="true" className="size-4" />
            </Button>
          ) : (
            <Button onClick={handleSubmit} isLoading={submitting} disabled={!configured}>
              {submitting ? "Creating workspace…" : "Create workspace"}
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

function ReviewItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs font-medium text-neutral-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium text-ink">{value}</dd>
    </div>
  );
}
