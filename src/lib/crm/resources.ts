/**
 * CRM ResourceConfig declarations (Phase 6).
 *
 * Each screen is a config consumed by the shared CRUD engine. Writes still go
 * through SECURITY DEFINER RPCs; these configs never talk to Supabase.
 */

import { createElement } from "react";
import { FlaskConical, PhoneCall, Share2, Target } from "lucide-react";
import { StatusBadge } from "@/components/ui/badge";
import { PERMISSIONS } from "@/lib/auth/permissions";
import { fromZod } from "@/lib/crud/validate";
import type { ResourceConfig } from "@/lib/crud/types";
import { loadMemberOptions } from "@/lib/operations/adapters";
import {
  followUpAdapter,
  leadAdapter,
  loadLeadOptions,
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
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: LEAD_STATUSES,
    },
  ],
  columns: [
    { id: "name", header: "Name", accessor: (row) => row.fullName },
    { id: "phone", header: "Phone", accessor: (row) => row.phone, format: "muted" },
    { id: "source", header: "Source", accessor: (row) => row.source, format: "muted" },
    { id: "interest", header: "Interest", accessor: (row) => row.interest, format: "muted" },
    { id: "branch", header: "Branch", accessor: (row) => row.branchName, format: "muted" },
    { id: "status", header: "Status", cell: (row) => createElement(StatusBadge, { status: row.status }) },
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
        { name: "notes", label: "Notes", type: "textarea", rows: 4, span: 2 },
      ],
    },
  ],
  validate: fromZod(leadFormSchema),
  adapter: leadAdapter,
  displayName: (row) => row.fullName,
  extraRowActions: (row) => [
    { label: "Schedule follow-up", href: `/crm/follow-ups/add?leadId=${row.id}` },
    { label: "Start trial", href: `/crm/trials/add?leadId=${row.id}` },
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
      ],
    },
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: FOLLOW_UP_STATUSES,
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
  ],
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
  filters: [
    {
      name: "status",
      label: "Status",
      allLabel: "All statuses",
      options: TRIAL_STATUSES,
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
    ...(row.leadId && !row.memberId
      ? [{ label: "Convert to member", href: `/crm/leads/${row.leadId}/convert` }]
      : []),
  ],
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
    { label: "Add as lead", href: `/crm/leads/add?name=${encodeURIComponent(row.referredName)}` },
  ],
};

export const CRM_RESOURCES = {
  leads: leadResource,
  follow_ups: followUpResource,
  trial_memberships: trialResource,
  referrals: referralResource,
} as const;

export type CrmResourceKey = keyof typeof CRM_RESOURCES;
