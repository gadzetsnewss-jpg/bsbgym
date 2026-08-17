/**
 * Mock organization data for the application shell (Phase 0).
 *
 * These values are displayed as placeholders until Phase 1 wires real
 * organization/branch/user data from Supabase. They are intentionally kept
 * in the data layer so swapping to API data does not touch any component.
 */

export interface Branch {
  id: string;
  name: string;
  city: string;
}

export const ORG_BRANCHES: Branch[] = [
  { id: "br-001", name: "BSB FitForge Main", city: "Mumbai" },
  { id: "br-002", name: "BSB FitForge Andheri", city: "Mumbai" },
  { id: "br-003", name: "BSB FitForge Bandra", city: "Mumbai" },
  { id: "br-004", name: "BSB FitForge Pune", city: "Pune" },
];

export const DEFAULT_BRANCH_ID = "br-001";

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
}

export const CURRENT_USER: CurrentUser = {
  id: "usr-owner",
  name: "Aarav Mehta",
  email: "owner@bsbfitforge.example",
  role: "Owner",
  initials: "AM",
};

export interface Notification {
  id: string;
  title: string;
  description: string;
  time: string;
  unread: boolean;
  tone: "info" | "warning" | "danger" | "success";
}

export const MOCK_NOTIFICATIONS: Notification[] = [
  {
    id: "n-1",
    title: "Membership expiring soon",
    description: "12 memberships expire within the next 7 days.",
    time: "10 min ago",
    unread: true,
    tone: "warning",
  },
  {
    id: "n-2",
    title: "New lead assigned",
    description: "Priya Sharma was added from the trial intake form.",
    time: "1 hr ago",
    unread: true,
    tone: "info",
  },
  {
    id: "n-3",
    title: "Payment received",
    description: "INR 18,000 collected from RK Fitness - Rajesh Kumar.",
    time: "3 hrs ago",
    unread: true,
    tone: "success",
  },
  {
    id: "n-4",
    title: "Invoice overdue",
    description: "Invoice INV-2026-0142 is 5 days overdue.",
    time: "Yesterday",
    unread: false,
    tone: "danger",
  },
];
