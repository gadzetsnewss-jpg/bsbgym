"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { z } from "zod";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft,
  BadgeCheck,
  CheckCircle2,
  ChevronRight,
  CreditCard,
  Home,
  MapPin,
  NotebookPen,
  Phone,
  Plus,
  User,
  UserPlus,
  Users,
} from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormField } from "@/components/ui/form-field";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { EmptyState } from "@/components/ui/empty-state";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { AddressFields } from "@/components/onboarding/fields";
import { useOrganization } from "@/components/auth/org-provider";
import { useToast } from "@/components/ui/toast";
import { UserAvatar } from "@/components/ui/user-avatar";
import {
  createGymMember,
  fetchGymMember,
  fetchTrainerOptions,
  type GymMemberRow,
  type GymMemberWriteInput,
  type TrainerOption,
} from "@/lib/org/gym-members";
import { GYM_MEMBER_STATUS_LABELS } from "@/lib/auth/permissions";
import {
  GYM_MEMBER_GENDERS,
  gymMemberFormSchema,
} from "@/lib/validation/auth-schemas";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

type MemberValues = z.infer<typeof gymMemberFormSchema>;

const FIELD =
  "rounded-[10px] border-[#DCE7E9] bg-white text-[#10252C] shadow-none placeholder:text-[#7D8B92] focus-visible:border-[#0E8F8B] focus-visible:ring-[rgba(14,143,139,0.16)]";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyValues(branchId = ""): MemberValues {
  return {
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    gender: "",
    dateOfBirth: "",
    branchId,
    joinedAt: todayIso(),
    emergencyContactName: "",
    emergencyContactPhone: "",
    notes: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
  };
}

function fullNameOf(values: Pick<MemberValues, "firstName" | "lastName">): string {
  return [values.firstName, values.lastName].map((part) => part.trim()).filter(Boolean).join(" ");
}

function displayOrPlaceholder(value: string | null | undefined, placeholder: string): { text: string; empty: boolean } {
  const text = value?.trim() ?? "";
  return text ? { text, empty: false } : { text: placeholder, empty: true };
}

function SectionCard({
  step,
  title,
  description,
  icon: Icon,
  columns = 2,
  children,
}: {
  step: number;
  title: string;
  description: string;
  icon: LucideIcon;
  columns?: 1 | 2;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#DCE7E9] bg-white p-5">
      <div className="mb-4 flex items-start gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-[#E8FBFA] text-[#0E8F8B]">
          <Icon aria-hidden="true" className="size-5" />
        </span>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold tracking-wider text-[#0E8F8B] uppercase">
            {step}. {title}
          </p>
          <p className="mt-0.5 text-sm text-[#5F7078]">{description}</p>
        </div>
      </div>
      <div className={cn("grid gap-4", columns === 2 ? "sm:grid-cols-2" : "grid-cols-1")}>
        {children}
      </div>
    </section>
  );
}

function PreviewRow({ label, value, empty }: { label: string; value: string; empty?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-2">
      <dt className="text-xs font-medium tracking-wide text-[#7D8B92] uppercase">{label}</dt>
      <dd className={cn("max-w-[60%] truncate text-right text-sm font-medium", empty ? "text-[#7D8B92]" : "text-[#10252C]")}>
        {value}
      </dd>
    </div>
  );
}

function NextAction({
  href,
  label,
  enabled,
  icon: Icon,
}: {
  href: string;
  label: string;
  enabled: boolean;
  icon: LucideIcon;
}) {
  const className = cn(
    "inline-flex h-10 w-full items-center justify-center gap-2 rounded-[10px] border px-4 text-sm font-medium transition-colors",
    enabled
      ? "border-[#0E8F8B] bg-[#E8FBFA] text-[#063C3B] hover:bg-[#0E8F8B] hover:text-white"
      : "cursor-not-allowed border-[#E1E7E8] bg-[#F2F4F4] text-[#9AA6AB]",
  );
  if (!enabled) {
    return (
      <button type="button" disabled className={className}>
        <Icon aria-hidden="true" className="size-4" />
        {label}
      </button>
    );
  }
  return (
    <Link href={href} className={className}>
      <Icon aria-hidden="true" className="size-4" />
      {label}
    </Link>
  );
}

export function AddMemberForm() {
  const router = useRouter();
  const { toast } = useToast();
  const { organization, branches, currentBranchId, can } = useOrganization();
  const orgId = organization?.id;
  const canSubmit = can("members.create");
  const canAssignMembership = can("memberships.create");
  const canCreateInvoice = can("billing.create");
  const canAssignTrainer = can("trainers.assign");

  const firstNameRef = React.useRef<HTMLInputElement>(null);
  const [values, setValues] = React.useState<MemberValues>(() => emptyValues());
  const [initialValues, setInitialValues] = React.useState<MemberValues>(() => emptyValues());
  const [errors, setErrors] = React.useState<Partial<Record<keyof MemberValues, string>>>({});
  const [formError, setFormError] = React.useState<string | null>(null);
  const [submitting, setSubmitting] = React.useState(false);
  const [leaveOpen, setLeaveOpen] = React.useState(false);
  const [trainers, setTrainers] = React.useState<TrainerOption[]>([]);
  const [trainerId, setTrainerId] = React.useState("");
  const [savedMember, setSavedMember] = React.useState<GymMemberRow | null>(null);

  React.useEffect(() => {
    firstNameRef.current?.focus();
  }, []);

  React.useEffect(() => {
    if (!branches.length) return;
    setValues((prev) => {
      if (prev.branchId) return prev;
      const next = { ...prev, branchId: currentBranchId ?? branches[0].id };
      setInitialValues(next);
      return next;
    });
  }, [branches, currentBranchId]);

  React.useEffect(() => {
    if (!orgId) return;
    let cancelled = false;
    void fetchTrainerOptions(orgId).then((result) => {
      if (cancelled || result.error || !result.data) return;
      setTrainers(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, [orgId]);

  const setField = (field: string, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => (field in prev ? { ...prev, [field]: undefined } : prev));
    setFormError(null);
  };

  const isDirty = React.useMemo(
    () => JSON.stringify(values) !== JSON.stringify(initialValues) || Boolean(trainerId),
    [values, initialValues, trainerId],
  );

  React.useEffect(() => {
    if (!isDirty || savedMember) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [isDirty, savedMember]);

  const requestLeave = () => {
    if (isDirty && !savedMember) {
      setLeaveOpen(true);
      return;
    }
    router.push("/members");
  };

  const resetForAnother = () => {
    const next = emptyValues(values.branchId || currentBranchId || branches[0]?.id || "");
    setValues(next);
    setInitialValues(next);
    setErrors({});
    setFormError(null);
    setTrainerId("");
    setSavedMember(null);
    setSubmitting(false);
    window.setTimeout(() => firstNameRef.current?.focus(), 0);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting || savedMember || !orgId || !canSubmit) return;

    const parsed = gymMemberFormSchema.safeParse(values);
    if (!parsed.success) {
      const nextErrors: Partial<Record<keyof MemberValues, string>> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as keyof MemberValues | undefined;
        if (key && !nextErrors[key]) nextErrors[key] = issue.message;
      }
      setErrors(nextErrors);
      setFormError("Please check the highlighted fields and try again.");
      return;
    }

    setSubmitting(true);
    setFormError(null);
    const input: GymMemberWriteInput = {
      organizationId: orgId,
      branchId: parsed.data.branchId,
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      phone: parsed.data.phone,
      email: parsed.data.email || null,
      gender: parsed.data.gender || null,
      dateOfBirth: parsed.data.dateOfBirth || null,
      emergencyContactName: parsed.data.emergencyContactName || null,
      emergencyContactPhone: parsed.data.emergencyContactPhone || null,
      notes: parsed.data.notes || null,
      addressLine1: parsed.data.addressLine1 || null,
      addressLine2: parsed.data.addressLine2 || null,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
      postalCode: parsed.data.postalCode || null,
      country: parsed.data.country || null,
      joinedAt: parsed.data.joinedAt || null,
    };

    const result = await createGymMember(input);
    if (result.error || !result.data) {
      setSubmitting(false);
      const message = result.error?.message ?? "Could not add member.";
      setFormError(message);
      toast({
        title: "Could not add member",
        description: message,
        variant: "error",
      });
      return;
    }

    const created = await fetchGymMember(orgId, result.data.id);
    setSubmitting(false);
    if (created.error || !created.data) {
      const branch = branches.find((item) => item.id === parsed.data.branchId);
      setSavedMember({
        id: result.data.id,
        organizationId: orgId,
        branchId: parsed.data.branchId,
        branchName: branch?.name ?? "",
        branchCode: branch?.code ?? "",
        code: "",
        firstName: parsed.data.firstName,
        lastName: parsed.data.lastName,
        fullName: fullNameOf(parsed.data),
        email: parsed.data.email || null,
        phone: parsed.data.phone,
        gender: (parsed.data.gender || null) as GymMemberRow["gender"],
        dateOfBirth: parsed.data.dateOfBirth || null,
        photoUrl: null,
        emergencyContactName: parsed.data.emergencyContactName || null,
        emergencyContactPhone: parsed.data.emergencyContactPhone || null,
        notes: parsed.data.notes || null,
        addressLine1: parsed.data.addressLine1 || null,
        addressLine2: parsed.data.addressLine2 || null,
        city: parsed.data.city || null,
        state: parsed.data.state || null,
        postalCode: parsed.data.postalCode || null,
        country: parsed.data.country || null,
        assignedTrainerId: trainerId || null,
        assignedTrainerName: trainers.find((item) => item.id === trainerId)?.name ?? null,
        status: "active",
        joinedAt: parsed.data.joinedAt || todayIso(),
        createdAt: "",
        updatedAt: "",
      });
    } else {
      setSavedMember(created.data);
    }
    setInitialValues(values);
    toast({ title: "Member added", variant: "success" });
    router.refresh();
  };

  const branchOptions = branches.map((branch) => ({
    value: branch.id,
    label: `${branch.name} (${branch.code})`,
  }));
  const selectedBranch = branches.find((branch) => branch.id === values.branchId);
  const selectedTrainer = trainers.find((trainer) => trainer.id === trainerId);
  const liveName = fullNameOf(values);
  const previewName = displayOrPlaceholder(liveName, "Member name");
  const previewPhone = displayOrPlaceholder(values.phone, "Phone not added");
  const previewBranch = displayOrPlaceholder(
    selectedBranch ? `${selectedBranch.name} (${selectedBranch.code})` : "",
    "Select a branch",
  );
  const previewJoin = displayOrPlaceholder(
    values.joinedAt ? formatDate(values.joinedAt) : "",
    "Join date",
  );
  const locked = Boolean(savedMember) || !canSubmit;
  const successEnabled = Boolean(savedMember);
  const viewHref = savedMember ? `/members/${savedMember.id}` : "/members";
  const membershipHref = savedMember
    ? `/memberships/active/add?memberId=${encodeURIComponent(savedMember.id)}&branchId=${encodeURIComponent(savedMember.branchId)}`
    : "/memberships/active/add";
  const invoiceHref = savedMember
    ? `/billing/new-invoice?memberId=${encodeURIComponent(savedMember.id)}&branchId=${encodeURIComponent(savedMember.branchId)}`
    : "/billing/new-invoice";
  const trainerHref = savedMember
    ? `/trainers/assignments/add?memberId=${encodeURIComponent(savedMember.id)}${
        trainerId ? `&trainerId=${encodeURIComponent(trainerId)}` : ""
      }`
    : "/trainers/assignments/add";

  if (!orgId) {
    return (
      <div className="space-y-6">
        <EmptyState
          title="Organization unavailable"
          description="Sign in with an organization to manage members."
          action={{ label: "Go to Dashboard", href: "/dashboard" }}
        />
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-3">
        <nav aria-label="Breadcrumb" className="flex items-center gap-1 text-xs font-medium text-[#5F7078]">
          <Link href="/dashboard" className="inline-flex items-center gap-1 transition-colors hover:text-[#0E8F8B]">
            <Home aria-hidden="true" className="size-3.5" />
            Home
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-[#C9D9DB]" />
          <Link href="/members" className="transition-colors hover:text-[#0E8F8B]">
            Members
          </Link>
          <ChevronRight aria-hidden="true" className="size-3.5 text-[#C9D9DB]" />
          <span className="text-[#10252C]">Add Member</span>
        </nav>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-[#10252C]">Add member</h1>
            <p className="mt-1 text-sm text-[#5F7078]">
              Register a new gym member. The member code is generated automatically.
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={requestLeave} className="border-[#DCE7E9] text-[#10252C]">
            <ArrowLeft aria-hidden="true" className="size-4" />
            Back to members
          </Button>
        </div>
      </header>

      {!canSubmit && (
        <div className="rounded-[12px] border border-[#FFF5DE] bg-[#FFF5DE] px-4 py-3 text-sm text-[#D88A00]">
          You do not have permission to add members.
        </div>
      )}

      {formError && !savedMember && (
        <div role="alert" className="rounded-[12px] border border-[#D94B4B]/20 bg-[#FFF0F0] px-4 py-3 text-sm text-[#D94B4B]">
          {formError}
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-[minmax(0,1.65fr)_minmax(280px,0.9fr)]">
        <form id="add-member-form" onSubmit={handleSubmit} className="space-y-4" noValidate>
          <SectionCard
            step={1}
            title="Personal Details"
            description="Start with the member's name. Only first and last name are required here."
            icon={User}
          >
            <FormField label="First name" required error={errors.firstName}>
              <Input
                ref={firstNameRef}
                autoComplete="given-name"
                placeholder="First name"
                value={values.firstName}
                invalid={Boolean(errors.firstName)}
                onChange={(event) => setField("firstName", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Last name" required error={errors.lastName}>
              <Input
                autoComplete="family-name"
                placeholder="Last name"
                value={values.lastName}
                invalid={Boolean(errors.lastName)}
                onChange={(event) => setField("lastName", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Date of birth" error={errors.dateOfBirth}>
              <Input
                type="date"
                value={values.dateOfBirth ?? ""}
                invalid={Boolean(errors.dateOfBirth)}
                onChange={(event) => setField("dateOfBirth", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Gender" error={errors.gender}>
              <Select
                options={[...GYM_MEMBER_GENDERS]}
                value={values.gender}
                invalid={Boolean(errors.gender)}
                onChange={(event) => setField("gender", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
          </SectionCard>

          <SectionCard
            step={2}
            title="Contact Information"
            description="Phone is required so staff can reach the member. India (+91) is the default country code."
            icon={Phone}
          >
            <FormField label="Phone" required error={errors.phone} hint="India (+91) is applied as the default country code.">
              <Input
                type="tel"
                autoComplete="tel"
                inputMode="tel"
                placeholder="+91 90000 00000"
                value={values.phone}
                invalid={Boolean(errors.phone)}
                onChange={(event) => setField("phone", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Email" error={errors.email}>
              <Input
                type="email"
                autoComplete="email"
                placeholder="name@email.com"
                value={values.email ?? ""}
                invalid={Boolean(errors.email)}
                onChange={(event) => setField("email", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Emergency contact name" error={errors.emergencyContactName}>
              <Input
                placeholder="Contact name"
                value={values.emergencyContactName ?? ""}
                invalid={Boolean(errors.emergencyContactName)}
                onChange={(event) => setField("emergencyContactName", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField label="Emergency contact phone" error={errors.emergencyContactPhone}>
              <Input
                type="tel"
                placeholder="Emergency phone"
                value={values.emergencyContactPhone ?? ""}
                invalid={Boolean(errors.emergencyContactPhone)}
                onChange={(event) => setField("emergencyContactPhone", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
          </SectionCard>

          <SectionCard
            step={3}
            title="Membership & Branch"
            description="Use the current branch when possible. Trainer assignment is completed after save."
            icon={BadgeCheck}
          >
            <FormField label="Branch" required error={errors.branchId}>
              <Select
                options={branchOptions}
                placeholder="Select a branch"
                value={values.branchId}
                invalid={Boolean(errors.branchId)}
                onChange={(event) => setField("branchId", event.target.value)}
                disabled={locked || branches.length === 0}
                className={FIELD}
              />
            </FormField>
            <FormField label="Join date" error={errors.joinedAt} hint="Defaults to today when left empty.">
              <Input
                type="date"
                value={values.joinedAt ?? ""}
                invalid={Boolean(errors.joinedAt)}
                onChange={(event) => setField("joinedAt", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
            <FormField
              label="Assigned trainer"
              hint="Shown for preview. Assignment is saved from the trainer workflow after this member exists."
              className="sm:col-span-2"
            >
              <Select
                options={[
                  { value: "", label: "Unassigned" },
                  ...trainers.map((trainer) => ({ value: trainer.id, label: trainer.name })),
                ]}
                value={trainerId}
                onChange={(event) => setTrainerId(event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
          </SectionCard>

          <SectionCard
            step={4}
            title="Address"
            description="Optional. Add it now or complete it later from the member profile."
            icon={MapPin}
            columns={1}
          >
            <AddressFields
              values={values as unknown as Record<string, string>}
              errors={errors as unknown as Record<string, string | undefined>}
              onChange={setField}
              disabled={locked}
            />
          </SectionCard>

          <SectionCard
            step={5}
            title="Notes"
            description="Internal notes stay on the member profile. Members do not see this."
            icon={NotebookPen}
            columns={1}
          >
            <FormField label="Notes" error={errors.notes}>
              <Textarea
                rows={4}
                placeholder="Allergies, preferred timing, or staff notes"
                value={values.notes ?? ""}
                invalid={Boolean(errors.notes)}
                onChange={(event) => setField("notes", event.target.value)}
                disabled={locked}
                className={FIELD}
              />
            </FormField>
          </SectionCard>
        </form>

        <aside className="space-y-4 lg:sticky lg:top-20">
          {savedMember ? (
            <section className="rounded-[14px] border border-[#1B9A52]/20 bg-white p-5">
              <div className="rounded-[12px] border border-[#1B9A52]/15 bg-[#E9F8EF] px-4 py-3">
                <p className="flex items-center gap-2 text-sm font-semibold text-[#14763F]">
                  <CheckCircle2 aria-hidden="true" className="size-5 text-[#1B9A52]" />
                  Member added successfully!
                </p>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <UserAvatar
                  name={savedMember.fullName || liveName || "Member"}
                  size="lg"
                  className="bg-[#0E8F8B]"
                />
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-[#10252C]">
                    {savedMember.fullName || liveName}
                  </p>
                  <p className="truncate text-sm text-[#5F7078]">
                    {savedMember.code || "Code generated"}
                  </p>
                </div>
              </div>
              <dl className="mt-3 divide-y divide-[#E9F8EF]">
                <PreviewRow label="Phone" value={savedMember.phone || previewPhone.text} empty={!savedMember.phone} />
                <PreviewRow
                  label="Branch"
                  value={
                    savedMember.branchName
                      ? `${savedMember.branchName}${savedMember.branchCode ? ` (${savedMember.branchCode})` : ""}`
                      : previewBranch.text
                  }
                  empty={!savedMember.branchName}
                />
                <PreviewRow
                  label="Join date"
                  value={formatDate(savedMember.joinedAt)}
                  empty={!savedMember.joinedAt}
                />
                <PreviewRow
                  label="Status"
                  value={GYM_MEMBER_STATUS_LABELS[savedMember.status] ?? savedMember.status}
                />
              </dl>
            </section>
          ) : (
            <section className="rounded-[14px] border border-[#DCE7E9] bg-white p-5">
              <p className="text-[11px] font-semibold tracking-wider text-[#0E8F8B] uppercase">Member Preview</p>
              <div className="mt-3 flex items-center gap-3">
                <UserAvatar name={liveName || "Member"} size="lg" className="bg-[#0E8F8B]" />
                <div className="min-w-0">
                  <p className={cn("truncate text-base font-semibold", previewName.empty ? "text-[#7D8B92]" : "text-[#10252C]")}>
                    {previewName.text}
                  </p>
                  <p className="text-sm text-[#7D8B92]">Code assigned on save</p>
                </div>
              </div>
              <dl className="mt-3 divide-y divide-[#F2F8F8]">
                <PreviewRow label="Phone" value={previewPhone.text} empty={previewPhone.empty} />
                <PreviewRow label="Branch" value={previewBranch.text} empty={previewBranch.empty} />
                <PreviewRow label="Join date" value={previewJoin.text} empty={previewJoin.empty} />
                <PreviewRow
                  label="Trainer"
                  value={selectedTrainer?.name ?? "Unassigned"}
                  empty={!selectedTrainer}
                />
                <PreviewRow label="Status" value="Ready to register" />
              </dl>
            </section>
          )}

          <section className="rounded-[14px] border border-[#DCE7E9] bg-white p-5">
            <p className="text-[11px] font-semibold tracking-wider text-[#0E8F8B] uppercase">Next steps</p>
            <p className="mt-1 text-sm text-[#5F7078]">
              Complete the member first, then continue directly to the next task.
            </p>
            <div className="mt-4 space-y-2">
              <NextAction
                href={viewHref}
                label="View Member"
                icon={Users}
                enabled={successEnabled}
              />
              <NextAction
                href={membershipHref}
                label="Add Membership"
                icon={BadgeCheck}
                enabled={successEnabled && canAssignMembership}
              />
              <NextAction
                href={invoiceHref}
                label="Create Invoice"
                icon={CreditCard}
                enabled={successEnabled && canCreateInvoice}
              />
              <NextAction
                href={trainerHref}
                label="Assign Trainer"
                icon={UserPlus}
                enabled={successEnabled && canAssignTrainer}
              />
            </div>
            {savedMember && (
              <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Button
                  type="button"
                  onClick={resetForAnother}
                  className="bg-[#0E8F8B] text-white hover:bg-[#0A7774]"
                >
                  <Plus aria-hidden="true" className="size-4" />
                  Add Another Member
                </Button>
                <Button type="button" variant="outline" onClick={() => router.push("/members")} className="border-[#DCE7E9]">
                  Back to Members
                </Button>
              </div>
            )}
          </section>
        </aside>
      </div>

      <div className="sticky bottom-0 z-30">
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-[14px] border border-[#DCE7E9] bg-white/95 p-4 shadow-pop backdrop-blur">
          <div className="flex min-w-0 items-center gap-3">
            <UserAvatar
              name={savedMember?.fullName || liveName || "Member"}
              size="sm"
              className="bg-[#0E8F8B]"
            />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-[#10252C]">
                {savedMember?.fullName || liveName || "New member"}
              </p>
              <p className="truncate text-xs text-[#5F7078]">
                {savedMember
                  ? [savedMember.code, savedMember.phone].filter(Boolean).join(" · ") || "Member saved"
                  : "Ready to save new member"}
              </p>
            </div>
          </div>
          <div className="flex w-full flex-wrap items-center justify-end gap-2 sm:w-auto">
            {savedMember ? (
              <>
                <Button type="button" variant="outline" onClick={resetForAnother} className="flex-1 border-[#DCE7E9] sm:flex-none">
                  Add Another Member
                </Button>
                <ButtonLink href={viewHref} className="flex-1 bg-[#0E8F8B] text-white hover:bg-[#0A7774] sm:flex-none">
                  View Member
                </ButtonLink>
              </>
            ) : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  onClick={requestLeave}
                  className="flex-1 border-[#DCE7E9] sm:flex-none"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  form="add-member-form"
                  isLoading={submitting}
                  disabled={!canSubmit || submitting}
                  className="flex-1 bg-[#0E8F8B] text-white hover:bg-[#0A7774] sm:flex-none"
                >
                  Add Member
                </Button>
              </>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={leaveOpen}
        onClose={() => setLeaveOpen(false)}
        onConfirm={() => {
          setLeaveOpen(false);
          router.push("/members");
        }}
        title="Discard unsaved changes?"
        description="Your edits will be lost if you leave this page."
        confirmLabel="Discard"
        tone="danger"
      />
    </div>
  );
}
