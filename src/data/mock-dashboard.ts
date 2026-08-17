import type {
  AttendanceOverviewData,
  ExpiryItem,
  KpiMetric,
  LowStockItem,
  MemberRow,
  MembershipOverviewStats,
  MultiSeriesChart,
  PaymentMethod,
  QuickAction,
  RevenueDataset,
  UpcomingClass,
} from "@/types/dashboard";

/**
 * Phase 0 dashboard mock data.
 *
 * Replace the functions in this file with Supabase-backed repositories in
 * Phase 1. The component layer only consumes the exported shapes.
 */

export const DASHBOARD_KPIS: KpiMetric[] = [
  {
    id: "active-members",
    label: "Active Members",
    value: "1,284",
    delta: 4.2,
    trend: "up",
    hint: "vs last month",
  },
  {
    id: "todays-attendance",
    label: "Today's Attendance",
    value: "342",
    delta: 6.5,
    trend: "up",
    hint: "26.6% of members",
  },
  {
    id: "todays-revenue",
    label: "Today's Revenue",
    value: "₹86,400",
    delta: 8.1,
    trend: "up",
    hint: "vs yesterday",
  },
  {
    id: "outstanding-dues",
    label: "Outstanding Dues",
    value: "₹2,14,500",
    delta: 5.2,
    trend: "down",
    trendGoodDirection: "down",
    hint: "128 invoices",
  },
  {
    id: "expiring",
    label: "Expiring Memberships",
    value: "36",
    delta: 11,
    trend: "down",
    trendGoodDirection: "down",
    hint: "next 30 days",
  },
  {
    id: "new-leads",
    label: "New Leads",
    value: "24",
    delta: 3,
    trend: "up",
    hint: "this week",
  },
];

/* ---------------------------------------------------------------------------
   Revenue Overview — period filterable datasets
   --------------------------------------------------------------------------- */

export const REVENUE_DATASETS: readonly RevenueDataset[] = [
  {
    period: "7d",
    label: "Last 7 days",
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series: [
      {
        name: "Billed",
        color: "var(--color-primary-600)",
        data: [62, 71, 58, 84, 92, 118, 74],
      },
      {
        name: "Collected",
        color: "var(--color-accent-500)",
        data: [55, 64, 52, 76, 86, 109, 86],
      },
    ],
  },
  {
    period: "30d",
    label: "Last 30 days",
    labels: [
      "W1",
      "W2",
      "W3",
      "W4",
      "W1",
      "W2",
      "W3",
      "W4",
      "W1",
      "W2",
      "W3",
      "W4",
    ],
    series: [
      {
        name: "Billed",
        color: "var(--color-primary-600)",
        data: [320, 345, 338, 372, 356, 389, 402, 415, 398, 421, 438, 452],
      },
      {
        name: "Collected",
        color: "var(--color-accent-500)",
        data: [295, 312, 306, 340, 331, 358, 372, 385, 369, 392, 410, 424],
      },
    ],
  },
  {
    period: "12m",
    label: "Last 12 months",
    labels: [
      "Sep",
      "Oct",
      "Nov",
      "Dec",
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
    ],
    series: [
      {
        name: "Billed",
        color: "var(--color-primary-600)",
        data: [4.6, 5.0, 4.8, 6.0, 5.7, 7.0, 6.8, 7.9, 7.4, 8.7, 9.1, 9.8],
      },
      {
        name: "Collected",
        color: "var(--color-accent-500)",
        data: [4.1, 4.6, 4.2, 5.5, 5.1, 6.2, 6.0, 7.1, 6.7, 7.8, 8.4, 9.0],
      },
    ],
  },
];

/* ---------------------------------------------------------------------------
   Membership Overview
   --------------------------------------------------------------------------- */

export const MEMBERSHIP_OVERVIEW: MembershipOverviewStats = {
  active: 1284,
  expiring: 36,
  frozen: 42,
  expired: 18,
};

/* ---------------------------------------------------------------------------
   Attendance Overview
   --------------------------------------------------------------------------- */

export const ATTENDANCE_OVERVIEW: AttendanceOverviewData = {
  today: {
    checkedIn: 342,
    target: 400,
    inGymNow: 87,
    peakLabel: "7–8 PM",
  },
  weekly: {
    labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"],
    series: [
      {
        name: "Check-ins",
        color: "var(--color-primary-500)",
        data: [286, 312, 298, 340, 355, 389, 264],
      },
    ],
  },
  peakHours: {
    labels: ["6a", "7a", "8a", "9a", "10a", "5p", "6p", "7p", "8p", "9p"],
    series: [
      {
        name: "Check-ins",
        color: "var(--color-accent-500)",
        data: [41, 68, 52, 31, 22, 28, 46, 64, 39, 24],
      },
    ],
  },
};

/* ---------------------------------------------------------------------------
   Recent activity tables
   --------------------------------------------------------------------------- */

export const RECENT_PAYMENTS: PaymentMethod[] = [
  {
    id: "p-1",
    invoice: "INV-2026-0142",
    member: "Rajesh Kumar",
    plan: "Annual Elite",
    amount: "₹18,000",
    method: "UPI",
    status: "Paid",
    date: "Today",
  },
  {
    id: "p-2",
    invoice: "INV-2026-0141",
    member: "Priya Sharma",
    plan: "Monthly Pro",
    amount: "₹2,500",
    method: "Card",
    status: "Paid",
    date: "Today",
  },
  {
    id: "p-3",
    invoice: "INV-2026-0138",
    member: "Amit Desai",
    plan: "Quarterly",
    amount: "₹6,900",
    method: "Cash",
    status: "Paid",
    date: "Yesterday",
  },
  {
    id: "p-4",
    invoice: "INV-2026-0136",
    member: "Sneha Kulkarni",
    plan: "Annual Elite",
    amount: "₹18,000",
    method: "UPI",
    status: "Pending",
    date: "Yesterday",
  },
  {
    id: "p-5",
    invoice: "INV-2026-0134",
    member: "Vikram Singh",
    plan: "Monthly Pro",
    amount: "₹2,500",
    method: "Card",
    status: "Overdue",
    date: "3 days ago",
  },
  {
    id: "p-6",
    invoice: "INV-2026-0130",
    member: "Kavya Nair",
    plan: "Monthly Pro",
    amount: "₹2,500",
    method: "UPI",
    status: "Paid",
    date: "4 days ago",
  },
];

export const RECENT_MEMBERS: MemberRow[] = [
  {
    id: "m-1",
    name: "Kavya Nair",
    plan: "Monthly Pro",
    trainer: "Rahul",
    joinedOn: "Today",
    status: "Active",
  },
  {
    id: "m-2",
    name: "Rohan Gupta",
    plan: "Quarterly",
    trainer: "—",
    joinedOn: "Yesterday",
    status: "Active",
  },
  {
    id: "m-3",
    name: "Ishita Roy",
    plan: "Trial",
    trainer: "Sana",
    joinedOn: "Yesterday",
    status: "Trial",
  },
  {
    id: "m-4",
    name: "Arjun Menon",
    plan: "Annual Elite",
    trainer: "Rahul",
    joinedOn: "2 days ago",
    status: "Active",
  },
  {
    id: "m-5",
    name: "Neha Patel",
    plan: "Monthly Pro",
    trainer: "Sana",
    joinedOn: "3 days ago",
    status: "Active",
  },
];

export const UPCOMING_EXPIRY: ExpiryItem[] = [
  {
    id: "e-1",
    name: "Rohan Gupta",
    plan: "Quarterly",
    expiresOn: "Aug 19, 2026",
    daysLeft: 3,
  },
  {
    id: "e-2",
    name: "Neha Patel",
    plan: "Monthly Pro",
    expiresOn: "Aug 21, 2026",
    daysLeft: 5,
  },
  {
    id: "e-3",
    name: "Vikram Singh",
    plan: "Monthly Pro",
    expiresOn: "Aug 24, 2026",
    daysLeft: 8,
  },
  {
    id: "e-4",
    name: "Sneha Kulkarni",
    plan: "Annual Elite",
    expiresOn: "Aug 30, 2026",
    daysLeft: 14,
  },
  {
    id: "e-5",
    name: "Arjun Menon",
    plan: "Annual Elite",
    expiresOn: "Sep 2, 2026",
    daysLeft: 17,
  },
];

/* ---------------------------------------------------------------------------
   Upcoming classes & low stock
   --------------------------------------------------------------------------- */

export const UPCOMING_CLASSES: UpcomingClass[] = [
  {
    id: "c-1",
    name: "HIIT Burn",
    trainer: "Rahul",
    time: "6:00 PM",
    duration: "45 min",
    capacity: 20,
    booked: 18,
  },
  {
    id: "c-2",
    name: "Power Yoga",
    trainer: "Sana",
    time: "7:00 AM",
    duration: "60 min",
    capacity: 25,
    booked: 22,
  },
  {
    id: "c-3",
    name: "Spin Cycle",
    trainer: "Vikrant",
    time: "7:30 PM",
    duration: "45 min",
    capacity: 15,
    booked: 11,
  },
  {
    id: "c-4",
    name: "Strength Fundamentals",
    trainer: "Rahul",
    time: "8:00 AM",
    duration: "60 min",
    capacity: 12,
    booked: 6,
  },
  {
    id: "c-5",
    name: "Zumba",
    trainer: "Ananya",
    time: "6:30 PM",
    duration: "50 min",
    capacity: 30,
    booked: 26,
  },
];

export const LOW_STOCK: LowStockItem[] = [
  {
    id: "ls-1",
    product: "Whey Protein 1kg",
    sku: "SUP-1002",
    current: 6,
    minimum: 12,
    unit: "pcs",
  },
  {
    id: "ls-2",
    product: "Shaker Bottles",
    sku: "ACC-2201",
    current: 4,
    minimum: 15,
    unit: "pcs",
  },
  {
    id: "ls-3",
    product: "Gym Towels (L)",
    sku: "TXT-3304",
    current: 22,
    minimum: 40,
    unit: "pcs",
  },
  {
    id: "ls-4",
    product: "Resistance Bands (set)",
    sku: "EQP-4410",
    current: 3,
    minimum: 8,
    unit: "set",
  },
  {
    id: "ls-5",
    product: "Sanitiser 5L",
    sku: "HYG-5501",
    current: 2,
    minimum: 5,
    unit: "pcs",
  },
];

export const QUICK_ACTIONS: QuickAction[] = [
  { id: "qa-1", label: "Add Member", href: "/members/add" },
  { id: "qa-2", label: "New Invoice", href: "/billing/new-invoice" },
  { id: "qa-3", label: "Check In", href: "/attendance" },
  { id: "qa-4", label: "Add Payment", href: "/billing/payments" },
  { id: "qa-5", label: "Add Lead", href: "/crm/leads" },
];
