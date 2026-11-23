"use client";

import * as React from "react";
import Link from "next/link";
import {
  Activity,
  AlertCircle,
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  CalendarCheck,
  CalendarDays,
  CalendarPlus,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Clock,
  Copy,
  CreditCard,
  Dumbbell,
  FileText,
  LineChart,
  Plus,
  QrCode,
  RefreshCcw,
  Salad,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UserRound,
  Users,
} from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchGymMember,
  fetchLinkedGymMemberId,
  fetchLinkedTrainerId,
  fetchMemberActiveMembership,
  fetchMemberAttendanceHistory,
  fetchMemberPtSessions,
  fetchMemberRecentInvoices,
  fetchTrainerAssignedMembers,
  fetchTrainerPtSessions,
  fetchTrainerRecentMeasurements,
  type GymMemberRow,
  type MemberActiveMembership,
  type MemberAttendanceHistoryItem,
  type MemberInvoiceSummary,
  type MemberPtSessionRow,
  type TrainerAssignedMemberRow,
  type TrainerSessionRow,
  type TrainerRecentMeasurementRow,
} from "@/lib/org/gym-members";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";

function humanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const TODAY_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

function formatTime(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  } catch {
    return dateStr;
  }
}

function getInitials(name?: string | null): string {
  if (!name) return "TR";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getGreeting(hour: number): string {
  if (hour < 5) return "Good night";
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export function TrainerHome() {
  const { organization, profile } = useOrganization();
  const orgId = organization?.id;
  const userId = profile?.id;

  const [trainerId, setTrainerId] = React.useState<string | null>(null);
  const [members, setMembers] = React.useState<TrainerAssignedMemberRow[]>([]);
  const [sessions, setSessions] = React.useState<TrainerSessionRow[]>([]);
  const [measurements, setMeasurements] = React.useState<TrainerRecentMeasurementRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const linked = await fetchLinkedTrainerId(orgId, userId);
    if (linked.error) {
      setLoading(false);
      setError(linked.error.message);
      return;
    }
    if (!linked.data) {
      setTrainerId(null);
      setMembers([]);
      setSessions([]);
      setMeasurements([]);
      setLoading(false);
      return;
    }
    const [memberResult, ptResult] = await Promise.all([
      fetchTrainerAssignedMembers(orgId, linked.data),
      fetchTrainerPtSessions(orgId, linked.data),
    ]);
    setLoading(false);
    if (memberResult.error) {
      setError(memberResult.error.message);
      return;
    }
    if (ptResult.error) {
      setError(ptResult.error.message);
      return;
    }

    const activeMemberRows = (memberResult.data ?? []).filter((row) => row.status === "active");
    setTrainerId(linked.data);
    setMembers(activeMemberRows);
    setSessions(ptResult.data ?? []);

    // Load recent measurements for this trainer's assigned members
    const memberIds = activeMemberRows.map((r) => r.memberId);
    if (memberIds.length > 0) {
      const measureResult = await fetchTrainerRecentMeasurements(orgId, memberIds, 5);
      if (!measureResult.error && measureResult.data) {
        setMeasurements(measureResult.data);
      }
    }
  }, [orgId, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading your training dashboard…" />;
  if (!trainerId) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Trainer profile is not linked"
        description="Ask an owner to link your login on your trainer profile. Until then you cannot see assigned members or schedule sessions."
      />
    );
  }

  const now = new Date();
  const todayDateStr = now.toISOString().slice(0, 10);
  const formattedTodayDate = TODAY_FORMATTER.format(now);
  const greeting = getGreeting(now.getHours());
  const firstName = profile?.firstName?.trim() || profile?.username || "Trainer";

  const activeMembers = members.filter((m) => m.status === "active");
  const todaySessions = sessions.filter((s) => s.scheduledAt.slice(0, 10) === todayDateStr);
  const upcomingSessions = sessions.filter(
    (s) => new Date(s.scheduledAt).getTime() > now.getTime() && s.status === "scheduled",
  );
  const completedSessions = sessions.filter((s) => s.status === "completed");
  const pendingLogSessions = sessions.filter(
    (s) => new Date(s.scheduledAt).getTime() <= now.getTime() && s.status === "scheduled",
  );

  return (
    <div className="space-y-6">
      {/* 1. TOP HEADER / WELCOME AREA */}
      <div className="relative overflow-hidden rounded-2xl border border-neutral-200/80 bg-gradient-to-br from-white via-neutral-50/40 to-teal-50/30 p-5 shadow-sm sm:p-6">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-16 -top-16 size-60 rounded-full bg-teal-100/40 blur-3xl"
        />
        <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200 bg-teal-50/80 px-2.5 py-0.5 text-xs font-semibold text-teal-800">
                <span className="size-1.5 rounded-full bg-teal-500 animate-pulse" />
                Trainer Portal
              </span>
              <span className="text-xs font-medium text-neutral-500">{formattedTodayDate}</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-ink sm:text-3xl">
              {greeting}, {firstName}
            </h1>
            <p className="text-sm text-neutral-500">
              Here&apos;s your training overview for today.
            </p>
            <div className="pt-1">
              {todaySessions.length > 0 ? (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-200/60 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <CalendarDays className="size-3.5 text-emerald-600" />
                  {todaySessions.length} PT session{todaySessions.length === 1 ? "" : "s"} scheduled today
                </span>
              ) : (
                <span className="inline-flex items-center gap-1.5 rounded-md border border-neutral-200/60 bg-neutral-100/80 px-2.5 py-1 text-xs font-medium text-neutral-600">
                  <CheckCircle2 className="size-3.5 text-teal-600" />
                  No sessions scheduled today &middot; You&apos;re all caught up
                </span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5 sm:self-center">
            <ButtonLink href="/trainers/pt-sessions/add" variant="primary" size="sm" className="shadow-sm">
              <CalendarPlus aria-hidden="true" className="mr-1.5 size-4" />
              Schedule PT
            </ButtonLink>
            <ButtonLink href="/fitness/progress" variant="outline" size="sm">
              <LineChart aria-hidden="true" className="mr-1.5 size-4 text-teal-600" />
              Record Progress
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* 2. KPI SUMMARY CARDS */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: My Members */}
        <Link
          href="/members"
          className="group rounded-xl border border-neutral-200/80 bg-white p-4.5 shadow-sm transition-all hover:border-teal-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider text-neutral-500 uppercase">
              My Members
            </span>
            <div className="rounded-lg bg-teal-50 p-2 text-teal-700 transition-colors group-hover:bg-teal-100">
              <Users className="size-4.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {activeMembers.length}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
            <span>Active assigned trainees</span>
            <ChevronRight className="size-3.5 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-teal-600" />
          </div>
        </Link>

        {/* Card 2: Today's PT Sessions */}
        <Link
          href="/trainers/pt-sessions"
          className="group rounded-xl border border-neutral-200/80 bg-white p-4.5 shadow-sm transition-all hover:border-emerald-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider text-neutral-500 uppercase">
              Today&apos;s Sessions
            </span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-700 transition-colors group-hover:bg-emerald-100">
              <CalendarDays className="size-4.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {todaySessions.length}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {todaySessions.length === 0 ? "Agenda is clear" : `${todaySessions.length} scheduled today`}
            </span>
            <ChevronRight className="size-3.5 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-emerald-600" />
          </div>
        </Link>

        {/* Card 3: Upcoming Sessions */}
        <Link
          href="/trainers/pt-sessions"
          className="group rounded-xl border border-neutral-200/80 bg-white p-4.5 shadow-sm transition-all hover:border-cyan-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider text-neutral-500 uppercase">
              Upcoming Sessions
            </span>
            <div className="rounded-lg bg-cyan-50 p-2 text-cyan-700 transition-colors group-hover:bg-cyan-100">
              <Clock className="size-4.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {upcomingSessions.length}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
            <span>Future bookings</span>
            <ChevronRight className="size-3.5 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-cyan-600" />
          </div>
        </Link>

        {/* Card 4: Pending Logs / Follow-ups */}
        <Link
          href="/trainers/pt-sessions"
          className="group rounded-xl border border-neutral-200/80 bg-white p-4.5 shadow-sm transition-all hover:border-amber-300 hover:shadow-md"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium tracking-wider text-neutral-500 uppercase">
              Pending Logs
            </span>
            <div className="rounded-lg bg-amber-50 p-2 text-amber-700 transition-colors group-hover:bg-amber-100">
              <ClipboardCheck className="size-4.5" />
            </div>
          </div>
          <p className="mt-2 text-2xl font-bold tracking-tight text-ink sm:text-3xl">
            {pendingLogSessions.length}
          </p>
          <div className="mt-1 flex items-center justify-between text-xs text-neutral-500">
            <span>
              {pendingLogSessions.length > 0 ? "Needs notes/completion" : "All logs up to date"}
            </span>
            <ChevronRight className="size-3.5 text-neutral-400 transition-transform group-hover:translate-x-0.5 group-hover:text-amber-600" />
          </div>
        </Link>
      </div>

      {/* 3. QUICK ACTIONS TOOLBAR */}
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-3 sm:p-3.5">
        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs font-semibold tracking-wider text-neutral-500 uppercase">
            Quick Actions
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <ButtonLink href="/members" variant="outline" size="sm" className="bg-white hover:bg-neutral-50">
              <Users className="mr-1.5 size-3.5 text-teal-600" />
              My Members
            </ButtonLink>
            <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm" className="bg-white hover:bg-neutral-50">
              <CalendarCheck className="mr-1.5 size-3.5 text-teal-600" />
              PT Sessions
            </ButtonLink>
            <ButtonLink href="/fitness/workout-plans/add" variant="outline" size="sm" className="bg-white hover:bg-neutral-50">
              <Dumbbell className="mr-1.5 size-3.5 text-teal-600" />
              Workout Plan
            </ButtonLink>
            <ButtonLink href="/fitness/diet-plans/add" variant="outline" size="sm" className="bg-white hover:bg-neutral-50">
              <Salad className="mr-1.5 size-3.5 text-teal-600" />
              Diet Plan
            </ButtonLink>
            <ButtonLink href="/fitness/progress" variant="outline" size="sm" className="bg-white hover:bg-neutral-50">
              <LineChart className="mr-1.5 size-3.5 text-teal-600" />
              Progress Tracker
            </ButtonLink>
          </div>
        </div>
      </div>

      {/* 4. MAIN DASHBOARD CONTENT GRID (7 Cols / 5 Cols) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* LEFT COLUMN: Today's Schedule & Upcoming Timeline (7 Cols) */}
        <div className="space-y-6 lg:col-span-7">
          {/* Card A: Today's Training Schedule */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">Today&apos;s Training Schedule</h2>
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                    {todaySessions.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">
                  Personal training sessions scheduled on your agenda today
                </p>
              </div>
              <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
                View all
              </ButtonLink>
            </div>

            {todaySessions.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-6 text-center">
                <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-teal-50 text-teal-700">
                  <CalendarDays className="size-5" />
                </div>
                <h3 className="mt-2 text-sm font-semibold text-ink">No training sessions today</h3>
                <p className="mt-1 text-xs text-neutral-500">
                  You have no scheduled PT sessions for today. Book a session with an assigned trainee.
                </p>
                <div className="mt-3 flex justify-center">
                  <ButtonLink href="/trainers/pt-sessions/add" variant="primary" size="sm">
                    <CalendarPlus className="mr-1.5 size-4" />
                    Schedule PT
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {todaySessions.map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col gap-3 rounded-xl border border-neutral-200/70 bg-white p-3.5 transition-all hover:border-teal-300 hover:shadow-sm sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-teal-100/70 text-xs font-bold text-teal-800">
                        {getInitials(row.memberName)}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-semibold text-ink">{row.memberName ?? "Member"}</p>
                          {row.memberCode && (
                            <span className="rounded bg-neutral-100 px-1.5 py-0.5 text-[10px] font-medium text-neutral-600">
                              {row.memberCode}
                            </span>
                          )}
                        </div>
                        <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                          <span className="font-medium text-teal-700">{formatTime(row.scheduledAt)}</span>
                          <span>&middot;</span>
                          <span>{row.durationMinutes ?? 60} mins</span>
                          <span>&middot;</span>
                          <span>Personal Training</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 sm:self-center">
                      <StatusBadge status={humanLabel(row.status)} />
                      <ButtonLink href={row.href} variant="outline" size="sm">
                        Details
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Card B: Upcoming Schedule Timeline */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Upcoming Schedule</h2>
                <p className="text-xs text-neutral-500">Next scheduled sessions with assigned trainees</p>
              </div>
              <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
                View schedule
              </ButtonLink>
            </div>

            {upcomingSessions.length === 0 ? (
              <p className="py-4 text-center text-xs text-neutral-500">
                No upcoming sessions scheduled. Book sessions from the PT Sessions tab.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                {upcomingSessions.slice(0, 4).map((row) => (
                  <div
                    key={row.id}
                    className="flex flex-col justify-between rounded-xl border border-neutral-200/70 bg-white p-3.5 transition-colors hover:border-neutral-300"
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-md bg-neutral-100 px-2 py-0.5 text-[11px] font-medium text-neutral-600">
                          {formatDateTime(row.scheduledAt)}
                        </span>
                        <StatusBadge status={humanLabel(row.status)} />
                      </div>
                      <p className="mt-2 text-sm font-semibold text-ink truncate">
                        {row.memberName ?? "Member"}
                      </p>
                      <p className="text-xs text-neutral-500">
                        {row.durationMinutes ?? 60} min session
                      </p>
                    </div>
                    <div className="mt-3 flex justify-end">
                      <ButtonLink href={row.href} variant="outline" size="sm">
                        View
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* RIGHT COLUMN: Assigned Members, Pending Tasks, Progress (5 Cols) */}
        <div className="space-y-6 lg:col-span-5">
          {/* Card C: My Assigned Members */}
          <Card className="p-5">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-ink">My Assigned Members</h2>
                  <span className="rounded-full bg-teal-50 px-2 py-0.5 text-xs font-semibold text-teal-700">
                    {activeMembers.length}
                  </span>
                </div>
                <p className="text-xs text-neutral-500">Trainees actively assigned to you</p>
              </div>
              <ButtonLink href="/members" variant="outline" size="sm">
                View all
              </ButtonLink>
            </div>

            {activeMembers.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-5 text-center">
                <UserRound className="mx-auto size-8 text-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">No members currently assigned to you.</p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {activeMembers.slice(0, 5).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200/60 p-2.5 transition-colors hover:bg-neutral-50/50"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-teal-100 text-xs font-bold text-teal-800">
                        {getInitials(row.memberName)}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink truncate">{row.memberName}</p>
                        <div className="flex items-center gap-1.5 text-[11px] text-neutral-500">
                          {row.memberCode && <span>{row.memberCode}</span>}
                          {row.memberCode && <span>&middot;</span>}
                          <span>Assigned {formatDate(row.assignedAt)}</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <ButtonLink
                        href={`/trainers/pt-sessions/add?memberId=${row.memberId}`}
                        variant="ghost"
                        size="sm"
                        className="text-xs text-teal-700 hover:text-teal-800 hover:bg-teal-50"
                      >
                        Schedule
                      </ButtonLink>
                      <ButtonLink href={`/members/${row.memberId}`} variant="outline" size="sm" className="text-xs">
                        Profile
                      </ButtonLink>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Card D: Pending Work & Follow-ups */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Pending Work &amp; Follow-ups</h2>
                <p className="text-xs text-neutral-500">Session logs &amp; tasks needing your attention</p>
              </div>
              {pendingLogSessions.length > 0 ? (
                <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-700">
                  {pendingLogSessions.length} pending
                </span>
              ) : (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
                  All clear
                </span>
              )}
            </div>

            {pendingLogSessions.length > 0 ? (
              <div className="space-y-2.5">
                {pendingLogSessions.slice(0, 3).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-amber-200/80 bg-amber-50/40 p-2.5"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink truncate">{row.memberName ?? "Member"}</p>
                      <p className="text-xs text-amber-800">
                        Session elapsed &middot; {formatDateTime(row.scheduledAt)}
                      </p>
                    </div>
                    <ButtonLink
                      href={`${row.href}/edit`}
                      variant="primary"
                      size="sm"
                      className="shrink-0 bg-amber-600 hover:bg-amber-700 text-xs"
                    >
                      Log Notes
                    </ButtonLink>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-200/70 bg-emerald-50/40 p-3.5">
                <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="size-4.5" />
                </div>
                <div className="text-xs text-emerald-900">
                  <p className="font-semibold">All logs up to date!</p>
                  <p className="text-emerald-700">
                    All session notes and member follow-ups have been completed.
                  </p>
                </div>
              </div>
            )}
          </Card>

          {/* Card E: Member Progress Snapshot */}
          <Card className="p-5">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink">Member Progress Snapshot</h2>
                <p className="text-xs text-neutral-500">Recent measurement updates for assigned trainees</p>
              </div>
              <ButtonLink href="/fitness/progress" variant="outline" size="sm">
                Open tracker
              </ButtonLink>
            </div>

            {measurements.length === 0 ? (
              <div className="rounded-xl border border-dashed border-neutral-200 bg-neutral-50/40 p-4 text-center">
                <LineChart className="mx-auto size-7 text-neutral-400" />
                <p className="mt-1 text-xs text-neutral-500">
                  No recent measurements recorded for your assigned members.
                </p>
                <div className="mt-2.5 flex justify-center">
                  <ButtonLink href="/fitness/progress" variant="outline" size="sm" className="text-xs">
                    <Plus className="mr-1 size-3.5 text-teal-600" />
                    Record measurement
                  </ButtonLink>
                </div>
              </div>
            ) : (
              <div className="space-y-2.5">
                {measurements.slice(0, 4).map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200/60 p-2.5 transition-colors hover:bg-neutral-50/50"
                  >
                    <div>
                      <p className="text-sm font-semibold text-ink">{row.memberName}</p>
                      <p className="text-[11px] text-neutral-500">
                        Measured {formatDate(row.measuredAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      {row.weightKg != null && (
                        <span className="rounded bg-teal-50 px-2 py-0.5 font-semibold text-teal-800">
                          {row.weightKg} kg
                        </span>
                      )}
                      {row.bodyFatPercent != null && (
                        <span className="rounded bg-sky-50 px-2 py-0.5 font-semibold text-sky-800">
                          {row.bodyFatPercent}% BF
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function MemberQrSvg({ code, size = 112 }: { code: string; size?: number }) {
  const matrix = React.useMemo(() => {
    const grid: boolean[][] = Array.from({ length: 15 }, () => Array(15).fill(false));
    // Top-left 5x5 finder pattern
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (r === 0 || r === 4 || c === 0 || c === 4 || (r === 2 && c === 2)) {
          grid[r][c] = true;
        }
      }
    }
    // Top-right 5x5 finder pattern
    for (let r = 0; r < 5; r++) {
      for (let c = 10; c < 15; c++) {
        const localC = c - 10;
        if (r === 0 || r === 4 || localC === 0 || localC === 4 || (r === 2 && localC === 2)) {
          grid[r][c] = true;
        }
      }
    }
    // Bottom-left 5x5 finder pattern
    for (let r = 10; r < 15; r++) {
      const localR = r - 10;
      for (let c = 0; c < 5; c++) {
        if (localR === 0 || localR === 4 || c === 0 || c === 4 || (localR === 2 && c === 2)) {
          grid[r][c] = true;
        }
      }
    }
    // Deterministic dot fill for data area based on code hash
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      hash = (hash << 5) - hash + code.charCodeAt(i);
      hash |= 0;
    }
    for (let r = 0; r < 15; r++) {
      for (let c = 0; c < 15; c++) {
        const inTL = r < 6 && c < 6;
        const inTR = r < 6 && c > 8;
        const inBL = r > 8 && c < 6;
        if (!inTL && !inTR && !inBL) {
          const bit = Math.abs((hash ^ (r * 17 + c * 31))) % 3;
          grid[r][c] = bit === 0;
        }
      }
    }
    return grid;
  }, [code]);

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 15 15"
      className="rounded bg-white p-1 text-neutral-900 shadow-inner"
      shapeRendering="crispEdges"
      aria-label={`QR Code for ${code}`}
    >
      {matrix.map((row, r) =>
        row.map((active, c) =>
          active ? (
            <rect key={`${r}-${c}`} x={c} y={r} width="1" height="1" fill="currentColor" />
          ) : null,
        ),
      )}
    </svg>
  );
}

export function MemberHome() {
  const { organization, profile } = useOrganization();
  const orgId = organization?.id;
  const userId = profile?.id;

  const [member, setMember] = React.useState<GymMemberRow | null>(null);
  const [membership, setMembership] = React.useState<MemberActiveMembership | null>(null);
  const [sessions, setSessions] = React.useState<MemberPtSessionRow[]>([]);
  const [attendance, setAttendance] = React.useState<MemberAttendanceHistoryItem[]>([]);
  const [invoices, setInvoices] = React.useState<MemberInvoiceSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [copiedCode, setCopiedCode] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!orgId || !userId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const linked = await fetchLinkedGymMemberId(orgId, userId);
    if (linked.error) {
      setLoading(false);
      setError(linked.error.message);
      return;
    }
    if (!linked.data) {
      setMember(null);
      setMembership(null);
      setSessions([]);
      setAttendance([]);
      setInvoices([]);
      setLoading(false);
      return;
    }
    const [memberResult, membershipResult, ptResult, attendanceResult, invoiceResult] =
      await Promise.all([
        fetchGymMember(orgId, linked.data),
        fetchMemberActiveMembership(orgId, linked.data),
        fetchMemberPtSessions(orgId, linked.data),
        fetchMemberAttendanceHistory(orgId, linked.data, 5),
        fetchMemberRecentInvoices(orgId, linked.data, 5),
      ]);
    setLoading(false);
    if (memberResult.error) {
      setError(memberResult.error.message);
      return;
    }
    setMember(memberResult.data);
    setMembership(membershipResult.data ?? null);
    setSessions(ptResult.data ?? []);
    setAttendance(attendanceResult.data ?? []);
    setInvoices(invoiceResult.data ?? []);
  }, [orgId, userId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const handleCopyCode = React.useCallback(() => {
    if (!member?.code) return;
    void navigator.clipboard.writeText(member.code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }, [member?.code]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading your member portal…" />;
  if (!member) {
    return (
      <EmptyState
        icon={UserRound}
        title="Member profile is not linked"
        description="Your member account has not been linked to a gym profile yet. Please contact the front desk."
      />
    );
  }

  const isMembershipActive = membership?.status === "active";
  const daysLeft = membership?.daysRemaining ?? 0;

  return (
    <div className="space-y-6">
      {/* 1. Digital Membership Card & Quick Check-in */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Digital Gym ID Pass */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary-950 via-primary-900 to-primary-800 p-6 text-white shadow-lg lg:col-span-2">
          {/* Subtle background graphics */}
          <div className="pointer-events-none absolute -right-12 -top-12 h-56 w-56 rounded-full bg-white/5 blur-2xl" />
          <div className="pointer-events-none absolute -bottom-8 right-24 h-40 w-40 rounded-full bg-primary-500/10 blur-xl" />

          <div className="relative z-10 flex flex-col justify-between space-y-6">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-4">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary-300" />
                <span className="text-sm font-semibold tracking-wider text-white uppercase">
                  {organization?.name ?? "BSB FitForge"}
                </span>
              </div>
              <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-xs font-medium text-primary-100 backdrop-blur-sm">
                {member.branchName || "Main Branch"}
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs font-medium tracking-wide text-primary-200 uppercase">
                  Member Name
                </p>
                <h3 className="mt-0.5 text-2xl font-bold tracking-tight text-white">
                  {member.fullName}
                </h3>
                <div className="mt-2 flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold tracking-wider text-primary-200">
                    {member.code}
                  </span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-0.5 text-xs font-medium text-white transition hover:bg-white/20"
                    title="Copy member code"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="h-3 w-3 text-emerald-300" /> Copied
                      </>
                    ) : (
                      <>
                        <Copy className="h-3 w-3" /> Copy
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <span
                  className={`inline-block rounded-full px-3 py-1 text-xs font-semibold ${
                    isMembershipActive
                      ? "bg-emerald-500/20 text-emerald-300 ring-1 ring-emerald-500/30"
                      : "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30"
                  }`}
                >
                  {membership ? humanLabel(membership.status) : "No Active Plan"}
                </span>
                {membership && (
                  <p className="mt-2 text-xs text-primary-200">
                    {daysLeft > 0 ? (
                      <span className="font-medium text-white">{daysLeft} days remaining</span>
                    ) : (
                      <span className="text-amber-300">Expired</span>
                    )}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 border-t border-white/10 pt-4 text-xs text-primary-200">
              <div>
                <span className="block text-primary-300">Active Plan</span>
                <span className="font-semibold text-white">
                  {membership?.planName ?? "None"}
                </span>
              </div>
              <div>
                <span className="block text-primary-300">Validity</span>
                <span className="font-semibold text-white">
                  {membership ? `${formatDate(membership.startDate)} – ${formatDate(membership.endDate)}` : "—"}
                </span>
              </div>
              <div>
                <span className="block text-primary-300">Member Since</span>
                <span className="font-semibold text-white">
                  {formatDate(member.joinedAt)}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Check-in QR Card */}
        <Card className="flex flex-col items-center justify-between space-y-4 p-6 text-center">
          <div>
            <div className="flex items-center justify-center gap-1.5 text-ink">
              <QrCode className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold">Contactless Check-In</h2>
            </div>
            <p className="mt-1 text-xs text-neutral-500">
              Scan at reception or biometric terminal
            </p>
          </div>

          <div className="rounded-xl border border-neutral-200 bg-neutral-50 p-3 shadow-xs">
            <MemberQrSvg code={member.code} size={120} />
          </div>

          <div className="w-full">
            <div
              className={`flex items-center justify-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold ${
                isMembershipActive
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-amber-50 text-amber-700"
              }`}
            >
              {isMembershipActive ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  <span>Valid for Check-in</span>
                </>
              ) : (
                <>
                  <AlertCircle className="h-3.5 w-3.5" />
                  <span>Renew Plan to Check-in</span>
                </>
              )}
            </div>
          </div>
        </Card>
      </div>

      {/* 2. Membership Details & Trainer Assignment */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Active Membership Details */}
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-ink">Membership Details</h2>
            </div>
            {membership && (
              <ButtonLink href="/memberships/renewals" variant="outline" size="sm">
                Renew
              </ButtonLink>
            )}
          </div>

          {membership ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-neutral-100 bg-neutral-50/60 p-3 text-xs">
                <div>
                  <span className="text-neutral-500">Plan Name</span>
                  <p className="font-semibold text-ink">{membership.planName}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Status</span>
                  <p className="font-semibold text-ink capitalize">{membership.status}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Start Date</span>
                  <p className="font-medium text-ink">{formatDate(membership.startDate)}</p>
                </div>
                <div>
                  <span className="text-neutral-500">End Date</span>
                  <p className="font-medium text-ink">{formatDate(membership.endDate)}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Amount Paid</span>
                  <p className="font-medium text-ink">{formatCurrency(membership.finalAmount)}</p>
                </div>
                <div>
                  <span className="text-neutral-500">Freeze Used</span>
                  <p className="font-medium text-ink">{membership.freezeDaysUsed} days</p>
                </div>
              </div>
            </div>
          ) : (
            <EmptyState
              icon={BadgeCheck}
              title="No active membership"
              description="You do not have an active membership plan. Contact the front desk to enroll."
            />
          )}
        </Card>

        {/* Assigned Trainer */}
        <Card className="space-y-4 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Dumbbell className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-ink">My Trainer</h2>
            </div>
            <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
              My Sessions
            </ButtonLink>
          </div>

          {member.assignedTrainerName ? (
            <div className="flex items-center justify-between rounded-lg border border-neutral-100 bg-neutral-50/60 p-4">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-100 text-primary-800 font-semibold text-sm">
                  {member.assignedTrainerName.slice(0, 2).toUpperCase()}
                </div>
                <div>
                  <p className="text-sm font-semibold text-ink">{member.assignedTrainerName}</p>
                  <p className="text-xs text-neutral-500">Certified Personal Trainer</p>
                </div>
              </div>
              <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
                Book Session
              </ButtonLink>
            </div>
          ) : (
            <EmptyState
              icon={Dumbbell}
              title="No trainer assigned"
              description="Your gym can assign a personal trainer to guide your workouts and diet."
            />
          )}
        </Card>
      </div>

      {/* 3. PT Sessions & Attendance History */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* PT Sessions */}
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-ink">PT Sessions</h2>
            </div>
            <ButtonLink href="/trainers/pt-sessions" variant="outline" size="sm">
              View all
            </ButtonLink>
          </div>
          {sessions.length === 0 ? (
            <EmptyState
              icon={CalendarDays}
              title="No PT sessions scheduled"
              description="Upcoming sessions with your personal trainer will appear here."
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {sessions.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{row.trainerName}</p>
                    <p className="text-xs text-neutral-500">{formatDateTime(row.scheduledAt)}</p>
                  </div>
                  <div className="flex items-center gap-3">
                    <StatusBadge status={humanLabel(row.status)} />
                    <ButtonLink href={`/trainers/pt-sessions/${row.id}`} variant="outline" size="sm">
                      View
                    </ButtonLink>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Recent Attendance */}
        <Card className="space-y-3 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <CalendarCheck className="h-4 w-4 text-primary-600" />
              <h2 className="text-sm font-semibold text-ink">Recent Check-ins</h2>
            </div>
            <ButtonLink href="/attendance" variant="outline" size="sm">
              History
            </ButtonLink>
          </div>
          {attendance.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No check-ins recorded"
              description="Your recent gym visits and check-in times will be tracked here."
            />
          ) : (
            <div className="divide-y divide-neutral-100">
              {attendance.map((row) => (
                <div key={row.id} className="flex flex-wrap items-center justify-between gap-3 py-2.5">
                  <div>
                    <p className="text-sm font-medium text-ink">{formatDateTime(row.checkInAt)}</p>
                    {row.checkOutAt && (
                      <p className="text-xs text-neutral-500">
                        Out: {formatDateTime(row.checkOutAt)}
                      </p>
                    )}
                  </div>
                  <span className="rounded-full bg-neutral-100 px-2.5 py-0.5 text-xs font-medium text-neutral-700 capitalize">
                    {row.method}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>

      {/* 4. Invoices & Payment Receipts */}
      <Card className="space-y-3 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary-600" />
            <h2 className="text-sm font-semibold text-ink">Invoices & Receipts</h2>
          </div>
          <ButtonLink href="/billing/invoices" variant="outline" size="sm">
            All Invoices
          </ButtonLink>
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={FileText}
            title="No billing invoices"
            description="Payment receipts and invoices issued for your memberships appear here."
          />
        ) : (
          <div className="divide-y divide-neutral-100">
            {invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-sm font-semibold text-ink">{inv.invoiceNumber}</p>
                  <p className="text-xs text-neutral-500">{formatDate(inv.invoiceDate)}</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-medium text-ink">{formatCurrency(inv.totalAmount)}</p>
                    {inv.balanceAmount > 0 && (
                      <p className="text-xs text-amber-600 font-medium">
                        Due: {formatCurrency(inv.balanceAmount)}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={humanLabel(inv.status)} />
                  <ButtonLink href={`/billing/invoices/${inv.id}`} variant="outline" size="sm">
                    View
                  </ButtonLink>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
