import type { NavSection } from "@/types/navigation";
import {
  Activity,
  BadgeCheck,
  Bell,
  BookOpen,
  Boxes,
  Building2,
  CalendarCheck,
  CalendarDays,
  CalendarRange,
  ChartColumn,
  CirclePlus,
  ClipboardList,
  Clock,
  CreditCard,
  Dumbbell,
  Factory,
  FileMinus,
  FilePlus,
  FileText,
  FlaskConical,
  HeartPulse,
  Hourglass,
  KeyRound,
  Layers,
  LayoutDashboard,
  Package,
  Percent,
  PhoneCall,
  ReceiptText,
  RefreshCcw,
  Ruler,
  Salad,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  ShoppingBag,
  ShoppingCart,
  SlidersHorizontal,
  Snowflake,
  Store,
  Target,
  TrendingUp,
  Truck,
  Undo2,
  UserCheck,
  UserPlus,
  UserRound,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import type { FlatNavItem } from "@/types/navigation";

/**
 * -----------------------------------------------------------------------------
 * BSB FitForge - Application navigation
 * -----------------------------------------------------------------------------
 * This is the single source of truth for the sidebar, header title,
 * breadcrumbs, and (future) permissions. New modules from future phases plug
 * in here without touching the shell components.
 * -----------------------------------------------------------------------------
 */

export const NAV_SECTIONS: NavSection[] = [
  {
    id: "dashboard",
    title: "Dashboard",
    items: [
      {
        title: "Dashboard",
        href: "/dashboard",
        icon: LayoutDashboard,
        description: "Overview of your gym's key metrics and activity.",
      },
    ],
  },
  {
    id: "members",
    title: "Members",
    items: [
      {
        title: "All Members",
        href: "/members",
        icon: Users,
        description: "Every member across your branches.",
      },
      {
        title: "Add Member",
        href: "/members/add",
        icon: UserPlus,
        description: "Register a new member profile.",
      },
      {
        title: "Expiring",
        href: "/members/expiring",
        icon: Clock,
        description: "Memberships nearing their end date.",
      },
      {
        title: "Inactive",
        href: "/members/inactive",
        icon: UserX,
        description: "Members whose memberships are paused or ended.",
      },
    ],
  },
  {
    id: "memberships",
    title: "Memberships",
    items: [
      {
        title: "Plans",
        href: "/memberships/plans",
        icon: Layers,
        description: "Membership plans and pricing.",
      },
      {
        title: "Active Memberships",
        href: "/memberships/active",
        icon: BadgeCheck,
        description: "Currently active memberships.",
      },
      {
        title: "Renewals",
        href: "/memberships/renewals",
        icon: RefreshCcw,
        description: "Memberships due for renewal.",
      },
      {
        title: "Freeze / Extend",
        href: "/memberships/freeze-extend",
        icon: Snowflake,
        description: "Freeze or extend membership timelines.",
      },
    ],
  },
  {
    id: "billing",
    title: "Billing",
    items: [
      {
        title: "Billing Dashboard",
        href: "/billing",
        icon: ChartColumn,
        description: "Billing overview, dues and receivables.",
      },
      {
        title: "New Invoice",
        href: "/billing/new-invoice",
        icon: FilePlus,
        description: "Create a professional invoice.",
      },
      {
        title: "Invoices",
        href: "/billing/invoices",
        icon: FileText,
        description: "All invoices and their statuses.",
      },
      {
        title: "Payments",
        href: "/billing/payments",
        icon: CreditCard,
        description: "Recorded payments and collections.",
      },
      {
        title: "Installments",
        href: "/billing/installments",
        icon: CalendarRange,
        description: "Split-payment installment schedules.",
      },
      {
        title: "Outstanding",
        href: "/billing/outstanding",
        icon: Hourglass,
        description: "Unpaid and overdue amounts.",
      },
      {
        title: "GST Master",
        href: "/billing/gst-master",
        icon: Percent,
        description: "Goods and services tax configuration.",
      },
      {
        title: "Credit Notes",
        href: "/billing/credit-notes",
        icon: FileMinus,
        description: "Credit notes issued against invoices.",
      },
      {
        title: "Refunds",
        href: "/billing/refunds",
        icon: Undo2,
        description: "Refund requests and history.",
      },
    ],
  },
  {
    id: "attendance",
    title: "Attendance",
    items: [
      {
        title: "Attendance",
        href: "/attendance",
        icon: CalendarCheck,
        description: "Daily check-ins and QR attendance.",
      },
    ],
  },
  {
    id: "trainers",
    title: "Trainers",
    items: [
      {
        title: "Trainers",
        href: "/trainers",
        icon: Dumbbell,
        description: "Trainer profiles and schedules.",
      },
      {
        title: "Assignments",
        href: "/trainers/assignments",
        icon: UserCheck,
        description: "Member-trainer assignments.",
      },
      {
        title: "PT Sessions",
        href: "/trainers/pt-sessions",
        icon: ClipboardList,
        description: "Personal training sessions.",
      },
    ],
  },
  {
    id: "fitness",
    title: "Fitness",
    items: [
      {
        title: "Exercises",
        href: "/fitness/exercises",
        icon: Activity,
        description: "Exercise library.",
      },
      {
        title: "Workout Plans",
        href: "/fitness/workout-plans",
        icon: HeartPulse,
        description: "Prescribed workout programs.",
      },
      {
        title: "Diet Plans",
        href: "/fitness/diet-plans",
        icon: Salad,
        description: "Nutrition and diet plans.",
      },
      {
        title: "Measurements",
        href: "/fitness/measurements",
        icon: Ruler,
        description: "Body measurements and tracking.",
      },
      {
        title: "Progress",
        href: "/fitness/progress",
        icon: TrendingUp,
        description: "Member progress and transformation.",
      },
    ],
  },
  {
    id: "classes",
    title: "Classes",
    items: [
      {
        title: "Class Schedule",
        href: "/classes/schedule",
        icon: CalendarDays,
        description: "Group class timetable.",
      },
      {
        title: "Bookings",
        href: "/classes/bookings",
        icon: BookOpen,
        description: "Class reservations.",
      },
      {
        title: "Waitlist",
        href: "/classes/waitlist",
        icon: CalendarCheck,
        description: "Members waiting for a spot.",
      },
    ],
  },
  {
    id: "pos",
    title: "POS",
    items: [
      {
        title: "New Sale",
        href: "/pos/new-sale",
        icon: ShoppingCart,
        description: "Point-of-sale checkout.",
      },
      {
        title: "Sales",
        href: "/pos/sales",
        icon: ShoppingBag,
        description: "POS sale history.",
      },
    ],
  },
  {
    id: "inventory",
    title: "Inventory",
    items: [
      {
        title: "Products",
        href: "/inventory/products",
        icon: Package,
        description: "Products sold or used by the gym.",
      },
      {
        title: "Stock",
        href: "/inventory/stock",
        icon: Boxes,
        description: "Stock levels and movements.",
      },
      {
        title: "Purchases",
        href: "/inventory/purchases",
        icon: Truck,
        description: "Purchase orders and receipts.",
      },
      {
        title: "Suppliers",
        href: "/inventory/suppliers",
        icon: Factory,
        description: "Supplier records.",
      },
    ],
  },
  {
    id: "crm",
    title: "CRM",
    items: [
      {
        title: "Leads",
        href: "/crm/leads",
        icon: Target,
        description: "Prospective members.",
      },
      {
        title: "Trials",
        href: "/crm/trials",
        icon: FlaskConical,
        description: "Trial memberships and visits.",
      },
      {
        title: "Follow-ups",
        href: "/crm/follow-ups",
        icon: PhoneCall,
        description: "Scheduled follow-up tasks.",
      },
      {
        title: "Referrals",
        href: "/crm/referrals",
        icon: Share2,
        description: "Referral program and tracking.",
      },
    ],
  },
  {
    id: "finance",
    title: "Finance",
    items: [
      {
        title: "Expenses",
        href: "/finance/expenses",
        icon: Wallet,
        description: "Gym expenses and cost tracking.",
      },
      {
        title: "Income",
        href: "/finance/income",
        icon: CirclePlus,
        description: "Income streams and recognition.",
      },
      {
        title: "Finance Reports",
        href: "/finance/reports",
        icon: ReceiptText,
        description: "Profit & loss and financial summaries.",
      },
    ],
  },
  {
    id: "reports",
    title: "Reports",
    items: [
      {
        title: "Reports",
        href: "/reports",
        icon: ChartColumn,
        description: "Business intelligence and analytics.",
      },
    ],
  },
  {
    id: "notifications",
    title: "Notifications",
    items: [
      {
        title: "Notifications",
        href: "/notifications",
        icon: Bell,
        description: "Alerts, reminders and automation history.",
      },
    ],
  },
  {
    id: "settings",
    title: "Settings",
    items: [
      {
        title: "My Profile",
        href: "/settings/profile",
        icon: UserRound,
        description: "Your personal account details.",
      },
      {
        title: "Organization",
        href: "/settings/organization",
        icon: Building2,
        description: "Gym organization profile.",
      },
      {
        title: "Branches",
        href: "/settings/branches",
        icon: Store,
        description: "Multi-branch management.",
      },
      {
        title: "Users & Roles",
        href: "/settings/users-roles",
        icon: Users,
        description: "Team members and role assignments.",
      },
      {
        title: "Permissions",
        href: "/settings/permissions",
        icon: Shield,
        description: "Role-based access control.",
      },
      {
        title: "Invoice Settings",
        href: "/settings/invoice-settings",
        icon: FileText,
        description: "Invoice numbering and branding.",
      },
      {
        title: "Tax / GST Settings",
        href: "/settings/tax-gst",
        icon: ShieldCheck,
        description: "Tax rates and registration details.",
      },
      {
        title: "General Settings",
        href: "/settings/general",
        icon: SlidersHorizontal,
        description: "Preferences and regional settings.",
      },
    ],
  },
];

/** Flat index of every nav item for search / breadcrumbs / page titles. */
export const FLAT_NAV_ITEMS: FlatNavItem[] = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({ ...item, sectionTitle: section.title })),
);

/** Lookup by href (exact match). */
export function findNavItem(href: string): FlatNavItem | undefined {
  return FLAT_NAV_ITEMS.find((item) => item.href === href);
}

export const APP_HOME = "/dashboard";
