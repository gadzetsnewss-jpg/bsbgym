/**
 * CRM ResourceConfig declarations (Phase 6).
 *
 * Each screen is a config consumed by the shared CRUD engine. Writes still go
 * through SECURITY DEFINER RPCs; these configs never talk to Supabase.
 */

import { createElement } from "react";
import { FlaskConical, PhoneCall, Share2, Target } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fromZod } from "@/lib/crud/validate";
import type { ResourceConfig, ResourceValues } from "@/lib/crud/types";
import { loadMemberOptions } from "@/lib/operations/adapters";
import {
  followUpAdapter,
  leadAdapter,
  loadLeadOptions,
  loadStaffOptions,
  referralAdapter,
  trialAdapter,
  type FollowUpRow,
  type LeadRow,
  type ReferralRow,
  type TrialRow,
} from "@/lib/crm/adapters";
import {
  FOLLOW_UP_STATUSES,
  LEAD_FORM_STATUSES,
  LEAD_STATUSES,
  REFERRAL_STATUSES,
  TRIAL_STATUSES,
  followUpFormSchema,
  leadFormSchema,
  referralFormSchema,
  trialFormSchema,
} from "@/lib/validation/crm-schemas";
import { leadDetailExtras } from "@/components/crm/lead-detail-extras";
import { LeadDuplicateWarning } from "@/components/crm/lead-duplicate-warning";

const crmPermissions = {
  view: PERMISSIONS.crm.view,
  create: PERMISSIONS.crm.manage,
  update: PERMISSIONS.crm.manage,
};

export const leadResource: ResourceConfig<LeadRow> = {
  key: "leads",
  title: "Leads",
  singular: "lead",
  description: "Prospective members. Convert a lead to continue in Members, Memberships and Billing.",
  icon: Target,
  routeBase: "/crm/leads",
  permissions: crmPermissions,
  searchPlaceholder: "Search leads by name, phone, email or source",
  emptyDescription: "Add a lead to start the sales follow-up.",
  createSuccessTitle: "Lead created successfully",
  afterCreate: ({ id, values }) => createElement(LeadCreatedNextSteps, { id, values }),
  formExtras: ({ values, organizationId, id }) =>
    createElement(LeadDuplicateWarning, { values, organizationId, excludeId: id }),
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: LEAD_STATUSES,
    },
    {
      name: "branchId",
      label: "Branch",
      allLabel: "All branches",
      optionsSource: "branches",
    },
    {
      name: "assignedTo",
      label: "Assigned staff",
      allLabel: "All staff",
      loadOptions: ({ organizationId }) => loadStaffOptions(organizationId),
    },
    {
      name: "created",
      label: "Added",
      allLabel: "Any date",
      options: [
        { value: "today", label: "Today" },
        { value: "this_week", label: "This week" },
        { value: "this_month", label: "This month" },
      ],
    },
  ],
  columns: [
    { id: "name", header: "Name", accessor: (row) => row.fullName },
    { id: "phone", header: "Phone", accessor: (row) => row.phone, format: "muted" },
    { id: "source", header: "Source", accessor: (row) => row.source, format: "muted" },
    { id: "status", header: "Status", cell: (row) => createElement(StatusBadge, { status: row.status }) },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
  ],
  fields: [
    {
      title: "Lead",
      columns: 2,
      fields: [
        { name: "firstName", label: "First name", required: true, autoComplete: "given-name" },
        { name: "lastName", label: "Last name", autoComplete: "family-name" },
        { name: "phone", label: "Phone", type: "tel", autoComplete: "tel" },
        { name: "email", label: "Email", type: "email", autoComplete: "email" },
        { name: "source", label: "Source", placeholder: "Walk-in, referral, Instagram…" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: LEAD_FORM_STATUSES,
          defaultValue: "new",
        },
        { name: "interest", label: "Interest", placeholder: "Plan or class they asked about" },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        {
          name: "assignedTo",
          label: "Assigned staff",
          type: "select",
          placeholder: "Unassigned",
          loadOptions: ({ organizationId }) => loadStaffOptions(organizationId),
        },
        { name: "notes", label: "Notes", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(leadFormSchema),
  adapter: leadAdapter,
  displayName: (row) => row.fullName,
  extraRowActions: (row) => [
    { label: "Add follow-up", href: `/crm/follow-ups/add?leadId=${row.id}${row.branchId ? `&branchId=${row.branchId}` : ""}` },
    { label: "Schedule trial", href: `/crm/trials/add?leadId=${row.id}${row.branchId ? `&branchId=${row.branchId}` : ""}` },
    ...(row.status === "converted" && row.convertedMemberId
      ? [{ label: "View member", href: `/members/${row.convertedMemberId}` }]
      : [{ label: "Convert to member", href: `/crm/leads/${row.id}/convert` }]),
  ],
  detailExtras: leadDetailExtras,
};

export const followUpResource: ResourceConfig<FollowUpRow> = {
  key: "follow_ups",
  title: "Follow-ups",
  singular: "follow-up",
  description: "Scheduled calls and visits for leads and members.",
  icon: PhoneCall,
  routeBase: "/crm/follow-ups",
  permissions: crmPermissions,
  searchPlaceholder: "Search follow-up notes",
  emptyDescription: "Schedule a follow-up from a lead or member.",
  createSuccessTitle: "Follow-up scheduled",
  afterCreate: ({ id, values }) => createElement(FollowUpCreatedNextSteps, { id, values }),
  defaultFilters: { bucket: "today" },
  filters: [
    {
      name: "bucket",
      label: "When",
      allLabel: "All dates",
      options: [
        { value: "today", label: "Today" },
        { value: "upcoming", label: "Upcoming" },
        { value: "overdue", label: "Overdue" },
        { value: "completed", label: "Completed" },
      ],
    },
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: FOLLOW_UP_STATUSES,
    },
    {
      name: "branchId",
      label: "Branch",
      allLabel: "All branches",
      optionsSource: "branches",
    },
  ],
  columns: [
    {
      id: "person",
      header: "Person",
      accessor: (row) => row.leadName || row.memberName,
    },
    { id: "due", header: "Due", accessor: (row) => row.dueAt, format: "datetime" },
    { id: "status", header: "Status", cell: (row) => createElement(StatusBadge, { status: row.status }) },
    { id: "notes", header: "Notes", accessor: (row) => row.notes, format: "muted" },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
  ],
  fields: [
    {
      title: "Follow-up",
      columns: 2,
      fields: [
        {
          name: "leadId",
          label: "Lead",
          type: "select",
          placeholder: "Select a lead",
          loadOptions: ({ organizationId }) => loadLeadOptions(organizationId),
        },
        {
          name: "memberId",
          label: "Member",
          type: "select",
          placeholder: "Or select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        { name: "dueAt", label: "Due", type: "datetime", required: true },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: FOLLOW_UP_STATUSES,
          defaultValue: "pending",
        },
        {
          name: "assignedTo",
          label: "Assigned staff",
          type: "select",
          placeholder: "Unassigned",
          loadOptions: ({ organizationId }) => loadStaffOptions(organizationId),
        },
        { name: "notes", label: "Notes", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(followUpFormSchema),
  adapter: followUpAdapter,
  displayName: (row) => row.leadName || row.memberName || "Follow-up",
  extraRowActions: (row) => [
    ...(row.leadId ? [{ label: "View lead", href: `/crm/leads/${row.leadId}` }] : []),
    ...(row.memberId ? [{ label: "View member", href: `/members/${row.memberId}` }] : []),
    ...(row.status === "pending"
      ? [{ label: "Complete / reschedule", href: `/crm/follow-ups/${row.id}/edit` }]
      : []),
    ...(row.leadId ? [{ label: "Schedule trial", href: `/crm/trials/add?leadId=${row.leadId}` }] : []),
  ],
  detailExtras: (row) =>
    createElement(RelatedNextSteps, {
      title: "Next step",
      description: "Open the person or continue the pipeline without searching again.",
      actions: [
        ...(row.leadId ? [{ label: "View lead", href: `/crm/leads/${row.leadId}` }] : []),
        ...(row.memberId ? [{ label: "View member", href: `/members/${row.memberId}` }] : []),
        ...(row.status === "pending"
          ? [{ label: "Complete / reschedule", href: `/crm/follow-ups/${row.id}/edit` }]
          : []),
        ...(row.leadId
          ? [{ label: "Schedule trial", href: `/crm/trials/add?leadId=${row.leadId}` }]
          : []),
      ],
    }),
};

export const trialResource: ResourceConfig<TrialRow> = {
  key: "trial_memberships",
  title: "Trials",
  singular: "trial",
  description: "Trial visits. Convert a successful trial into a member and membership.",
  icon: FlaskConical,
  routeBase: "/crm/trials",
  permissions: crmPermissions,
  searchPlaceholder: "Search trial notes",
  emptyDescription: "Start a trial from a lead to track the visit dates.",
  createSuccessTitle: "Trial scheduled",
  afterCreate: ({ id, values }) => createElement(TrialCreatedNextSteps, { id, values }),
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: TRIAL_STATUSES,
    },
    {
      name: "branchId",
      label: "Branch",
      allLabel: "All branches",
      optionsSource: "branches",
    },
  ],
  columns: [
    {
      id: "person",
      header: "Person",
      accessor: (row) => row.leadName || row.memberName,
    },
    { id: "start", header: "Starts", accessor: (row) => row.startsOn, format: "date" },
    { id: "end", header: "Ends", accessor: (row) => row.endsOn, format: "date" },
    { id: "status", header: "Status", cell: (row) => createElement(StatusBadge, { status: row.status }) },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
  ],
  fields: [
    {
      title: "Trial",
      columns: 2,
      fields: [
        {
          name: "leadId",
          label: "Lead",
          type: "select",
          placeholder: "Select a lead",
          loadOptions: ({ organizationId }) => loadLeadOptions(organizationId),
        },
        {
          name: "memberId",
          label: "Member",
          type: "select",
          placeholder: "Or select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        {
          name: "branchId",
          label: "Branch",
          type: "select",
          required: true,
          optionsSource: "branches",
          placeholder: "Select a branch",
        },
        { name: "startsOn", label: "Starts on", type: "date" },
        { name: "endsOn", label: "Ends on", type: "date", hint: "Defaults to 7 days after start." },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: TRIAL_STATUSES,
          defaultValue: "scheduled",
        },
        { name: "notes", label: "Notes", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(trialFormSchema),
  adapter: trialAdapter,
  displayName: (row) => `${row.leadName || row.memberName || "Trial"}`,
  extraRowActions: (row) => [
    ...(row.leadId ? [{ label: "View lead", href: `/crm/leads/${row.leadId}` }] : []),
    ...(row.memberId ? [{ label: "View member", href: `/members/${row.memberId}` }] : []),
    ...(row.leadId ? [{ label: "Add follow-up", href: `/crm/follow-ups/add?leadId=${row.leadId}` }] : []),
    ...(row.leadId && !row.memberId
      ? [{ label: "Convert to member", href: `/crm/leads/${row.leadId}/convert` }]
      : []),
  ],
  detailExtras: (row) =>
    createElement(RelatedNextSteps, {
      title: "Next step",
      description: "A trial visit does not create a membership. Follow up or convert when ready.",
      actions: [
        ...(row.leadId ? [{ label: "View lead", href: `/crm/leads/${row.leadId}` }] : []),
        ...(row.memberId ? [{ label: "View member", href: `/members/${row.memberId}` }] : []),
        ...(row.leadId
          ? [{ label: "Add follow-up", href: `/crm/follow-ups/add?leadId=${row.leadId}` }]
          : []),
        ...(row.leadId && !row.memberId
          ? [{ label: "Convert to member", href: `/crm/leads/${row.leadId}/convert` }]
          : []),
      ],
    }),
};

export const referralResource: ResourceConfig<ReferralRow> = {
  key: "referrals",
  title: "Referrals",
  singular: "referral",
  description: "Track who referred a prospect. Rewards stay as notes — no commission engine.",
  icon: Share2,
  routeBase: "/crm/referrals",
  permissions: crmPermissions,
  searchPlaceholder: "Search referrals by name or phone",
  emptyDescription: "Record a referral from an existing member.",
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: REFERRAL_STATUSES,
    },
  ],
  columns: [
    { id: "referrer", header: "Referrer", accessor: (row) => row.referrerName },
    { id: "referred", header: "Referred", accessor: (row) => row.referredName },
    { id: "phone", header: "Phone", accessor: (row) => row.referredPhone, format: "muted" },
    { id: "status", header: "Status", cell: (row) => createElement(StatusBadge, { status: row.status }) },
    { id: "created", header: "Date", accessor: (row) => row.createdAt, format: "date" },
    { id: "reward", header: "Reward note", accessor: (row) => row.reward, format: "muted" },
  ],
  fields: [
    {
      title: "Referral",
      columns: 2,
      fields: [
        {
          name: "referrerMemberId",
          label: "Referring member",
          type: "select",
          required: true,
          placeholder: "Select a member",
          loadOptions: ({ organizationId }) => loadMemberOptions(organizationId),
        },
        { name: "referredName", label: "Referred name", required: true },
        { name: "referredPhone", label: "Phone", type: "tel" },
        { name: "referredEmail", label: "Email", type: "email" },
        {
          name: "status",
          label: "Status",
          type: "select",
          options: REFERRAL_STATUSES,
          defaultValue: "pending",
        },
        { name: "reward", label: "Reward note", placeholder: "Optional staff note" },
        { name: "notes", label: "Notes", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(referralFormSchema),
  adapter: referralAdapter,
  displayName: (row) => row.referredName,
  extraRowActions: (row) => [
    { label: "View referrer", href: `/members/${row.referrerMemberId}` },
    {
      label: "Add as lead",
      href: `/crm/leads/add?name=${encodeURIComponent(row.referredName)}${
        row.referredPhone ? `&phone=${encodeURIComponent(row.referredPhone)}` : ""
      }`,
    },
  ],
};

function RelatedNextSteps({
  title,
  description,
  actions,
}: {
  title: string;
  description: string;
  actions: { label: string; href: string }[];
}) {
  if (actions.length === 0) return null;
  return createElement(
    Card,
    { className: "space-y-4" },
    createElement("p", { className: "text-sm font-semibold text-ink" }, title),
    createElement("p", { className: "text-sm text-neutral-500" }, description),
    createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      ...actions.map((action) =>
        createElement(ButtonLink, { href: action.href, variant: "outline", size: "sm" }, action.label),
      ),
    ),
  );
}

function branchQueryOf(values: ResourceValues): string {
  const branchId = typeof values.branchId === "string" ? values.branchId : "";
  return branchId ? `&branchId=${encodeURIComponent(branchId)}` : "";
}

function LeadCreatedNextSteps({ id, values }: { id: string; values: ResourceValues }) {
  const branchQuery = branchQueryOf(values);
  return createElement(
    Card,
    { className: "space-y-4" },
    createElement("p", { className: "text-sm font-semibold text-ink" }, "Lead created successfully"),
    createElement(
      "p",
      { className: "text-sm text-neutral-500" },
      "Stay with this lead. Follow up, start a trial, or convert without searching again.",
    ),
    createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      createElement(ButtonLink, { href: `/crm/leads/${id}`, size: "sm" }, "View lead"),
      createElement(
        ButtonLink,
        { href: `/crm/follow-ups/add?leadId=${id}${branchQuery}`, variant: "outline", size: "sm" },
        "Add follow-up",
      ),
      createElement(
        ButtonLink,
        { href: `/crm/trials/add?leadId=${id}${branchQuery}`, variant: "outline", size: "sm" },
        "Schedule trial",
      ),
      createElement(
        ButtonLink,
        { href: `/crm/leads/${id}/convert`, variant: "outline", size: "sm" },
        "Convert to member",
      ),
    ),
  );
}

function FollowUpCreatedNextSteps({ id, values }: { id: string; values: ResourceValues }) {
  const leadId = typeof values.leadId === "string" ? values.leadId : "";
  const memberId = typeof values.memberId === "string" ? values.memberId : "";
  const branchQuery = branchQueryOf(values);
  return createElement(
    Card,
    { className: "space-y-4" },
    createElement("p", { className: "text-sm font-semibold text-ink" }, "Follow-up scheduled"),
    createElement(
      "p",
      { className: "text-sm text-neutral-500" },
      "Open the person or schedule the next step without searching again.",
    ),
    createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      createElement(ButtonLink, { href: `/crm/follow-ups/${id}`, size: "sm" }, "View follow-up"),
      leadId
        ? createElement(ButtonLink, { href: `/crm/leads/${leadId}`, variant: "outline", size: "sm" }, "View lead")
        : null,
      memberId
        ? createElement(ButtonLink, { href: `/members/${memberId}`, variant: "outline", size: "sm" }, "View member")
        : null,
      leadId
        ? createElement(
            ButtonLink,
            { href: `/crm/trials/add?leadId=${leadId}${branchQuery}`, variant: "outline", size: "sm" },
            "Schedule trial",
          )
        : null,
    ),
  );
}

function TrialCreatedNextSteps({ id, values }: { id: string; values: ResourceValues }) {
  const leadId = typeof values.leadId === "string" ? values.leadId : "";
  const memberId = typeof values.memberId === "string" ? values.memberId : "";
  const followUpHref = leadId
    ? `/crm/follow-ups/add?leadId=${encodeURIComponent(leadId)}${branchQueryOf(values)}`
    : `/crm/follow-ups/add`;
  return createElement(
    Card,
    { className: "space-y-4" },
    createElement("p", { className: "text-sm font-semibold text-ink" }, "Trial scheduled"),
    createElement(
      "p",
      { className: "text-sm text-neutral-500" },
      "A trial visit does not create a membership. Follow up or convert when the visit succeeds.",
    ),
    createElement(
      "div",
      { className: "flex flex-wrap gap-2" },
      createElement(ButtonLink, { href: `/crm/trials/${id}`, size: "sm" }, "View trial"),
      leadId
        ? createElement(ButtonLink, { href: followUpHref, variant: "outline", size: "sm" }, "Add follow-up")
        : null,
      leadId && !memberId
        ? createElement(
            ButtonLink,
            { href: `/crm/leads/${leadId}/convert`, variant: "outline", size: "sm" },
            "Convert to member",
          )
        : null,
      memberId
        ? createElement(ButtonLink, { href: `/members/${memberId}`, variant: "outline", size: "sm" }, "View member")
        : null,
    ),
  );
}

export const CRM_RESOURCES = {
  leads: leadResource,
  follow_ups: followUpResource,
  trial_memberships: trialResource,
  referrals: referralResource,
} as const;

export type CrmResourceKey = keyof typeof CRM_RESOURCES;
