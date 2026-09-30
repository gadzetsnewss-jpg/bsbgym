/**
 * Org-scoped dashboard reads (Phase 4).
 *
 * Attendance and upcoming classes are live. Other KPI tiles still come from
 * mock data until later phases replace them.
 */

import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import { friendlyMessage } from "@/lib/errors";
import type { OrgResult } from "@/lib/org/members";
import type { AttendanceOverviewData, UpcomingClass } from "@/types/dashboard";

type AnyTable = "gym_members";
type Row = Record<string, unknown>;

function utcDayBounds(daysAgo = 0): { start: string; end: string } {
  const start = new Date();
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - daysAgo);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start: start.toISOString(), end: end.toISOString() };
}

function embedName(value: unknown): string {
  if (!value) return "—";
  const record = (Array.isArray(value) ? value[0] : value) as
    | { name?: string; full_name?: string; first_name?: string; last_name?: string }
    | null;
  if (!record) return "—";
  if (record.full_name) return record.full_name;
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  if (joined) return joined;
  return record.name ?? "—";
}

function weekdayLabel(iso: string): string {
  return new Date(iso).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
}

function hourLabel(iso: string): string {
  const hour = new Date(iso).getUTCHours();
  const suffix = hour >= 12 ? "PM" : "AM";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${twelve} ${suffix}`;
}

export async function fetchAttendanceOverview(
  organizationId: string,
): Promise<OrgResult<AttendanceOverviewData>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const today = utcDayBounds(0);
  const weekStart = utcDayBounds(6).start;

  const [{ data, error }, memberCount] = await Promise.all([
    supabase
      .from("attendance_records" as AnyTable)
      .select("id, check_in_at, check_out_at")
      .eq("organization_id", organizationId)
      .gte("check_in_at" as "created_at", weekStart)
      .lt("check_in_at" as "created_at", today.end)
      .order("check_in_at" as "created_at", { ascending: true })
      .limit(2000),
    supabase
      .from("gym_members")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
  ]);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  if (memberCount.error) return { data: null, error: { message: friendlyMessage(memberCount.error) } };

  const rows = (data ?? []) as unknown as Row[];
  const activeMembers = memberCount.count ?? 0;
  const todayRows = rows.filter((row) => {
    const at = String(row.check_in_at ?? "");
    return at >= today.start && at < today.end;
  });
  const inGymNow = todayRows.filter((row) => !row.check_out_at).length;

  const weeklyCounts = new Map<string, number>();
  for (let i = 6; i >= 0; i -= 1) {
    const bounds = utcDayBounds(i);
    weeklyCounts.set(weekdayLabel(bounds.start), 0);
  }
  const peakCounts = new Map<string, number>();

  for (const row of rows) {
    const at = String(row.check_in_at ?? "");
    if (!at) continue;
    const day = weekdayLabel(at);
    if (weeklyCounts.has(day)) weeklyCounts.set(day, (weeklyCounts.get(day) ?? 0) + 1);
    if (at >= today.start && at < today.end) {
      const hour = hourLabel(at);
      peakCounts.set(hour, (peakCounts.get(hour) ?? 0) + 1);
    }
  }

  let peakLabel = "—";
  let peakValue = 0;
  for (const [label, count] of peakCounts) {
    if (count > peakValue) {
      peakValue = count;
      peakLabel = label;
    }
  }

  const weeklyLabels = [...weeklyCounts.keys()];
  const peakLabels = [...peakCounts.keys()];
  if (peakLabels.length === 0) peakLabels.push("—");

  return {
    data: {
      today: {
        checkedIn: todayRows.length,
        target: Math.max(activeMembers, todayRows.length, 0),
        inGymNow,
        peakLabel: peakValue > 0 ? peakLabel : "—",
      },
      weekly: {
        labels: weeklyLabels,
        series: [{ name: "Check-ins", color: "#0d9488", data: weeklyLabels.map((label) => weeklyCounts.get(label) ?? 0) }],
      },
      peakHours: {
        labels: peakLabels,
        series: [
          {
            name: "Check-ins",
            color: "#0d9488",
            data: peakLabels.map((label) => peakCounts.get(label) ?? 0),
          },
        ],
      },
    },
    error: null,
  };
}

export async function fetchUpcomingClasses(
  organizationId: string,
): Promise<OrgResult<UpcomingClass[]>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };

  const now = new Date().toISOString();
  const { data, error } = await supabase
    .from("class_sessions" as AnyTable)
    .select(
      "id, starts_at, ends_at, capacity, status, class_templates(name), trainers(full_name, first_name, last_name), class_bookings(id, status)",
    )
    .eq("organization_id", organizationId)
    .eq("status" as "id", "scheduled")
    .gte("starts_at" as "created_at", now)
    .order("starts_at" as "created_at", { ascending: true })
    .limit(8);

  if (error) return { data: null, error: { message: friendlyMessage(error) } };

  return {
    data: ((data ?? []) as unknown as Row[]).map((row) => {
      const starts = String(row.starts_at ?? "");
      const ends = String(row.ends_at ?? "");
      const startDate = starts ? new Date(starts) : null;
      const endDate = ends ? new Date(ends) : null;
      const durationMin =
        startDate && endDate && !Number.isNaN(startDate.getTime()) && !Number.isNaN(endDate.getTime())
          ? Math.max(Math.round((endDate.getTime() - startDate.getTime()) / 60000), 0)
          : 0;
      const bookings = Array.isArray(row.class_bookings) ? row.class_bookings : [];
      const booked = bookings.filter((booking) => {
        const status = String((booking as Row).status ?? "");
        return status === "booked" || status === "attended";
      }).length;
      return {
        id: String(row.id),
        name: embedName(row.class_templates),
        trainer: embedName(row.trainers),
        time: startDate && !Number.isNaN(startDate.getTime())
          ? startDate.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
          : "—",
        duration: durationMin > 0 ? `${durationMin} min` : "—",
        capacity: typeof row.capacity === "number" ? row.capacity : Number(row.capacity) || 0,
        booked,
      };
    }),
    error: null,
  };
}

export async function fetchTodaysAttendanceCount(
  organizationId: string,
): Promise<OrgResult<number>> {
  const supabase = getSupabaseBrowserClient();
  if (!supabase) return { data: null, error: { message: "Supabase is not configured." } };
  const today = utcDayBounds(0);
  const { count, error } = await supabase
    .from("attendance_records" as AnyTable)
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("check_in_at" as "created_at", today.start)
    .lt("check_in_at" as "created_at", today.end);
  if (error) return { data: null, error: { message: friendlyMessage(error) } };
  return { data: count ?? 0, error: null };
}
