import type { LucideIcon } from "lucide-react";

/** A single navigation entry. Adding a new module = adding entries here. */
export interface NavItem {
  title: string;
  href: string;
  icon: LucideIcon;
  /** Optional short badge rendered next to the sidebar label. */
  badge?: string;
  /** Short copy used by page headers / placeholder pages. */
  description?: string;
}

/** A group of navigation entries shown under one sidebar heading. */
export interface NavSection {
  id: string;
  title: string;
  items: NavItem[];
}

/** Flat list of every navigation entry (used by search / breadcrumbs). */
export type FlatNavItem = NavItem & { sectionTitle: string };
