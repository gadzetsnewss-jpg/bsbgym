"use client";

import * as React from "react";
import { Calendar, Flame, CheckCircle, Clock, QrCode, TrendingUp, RefreshCw } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/components/auth/org-provider";
import { loadMemberMyAttendanceStats, loadMemberAttendanceHistory } from "@/lib/attendance/client";
import type { MemberAttendanceRow, MemberAttendanceStats } from "@/lib/attendance/types";

export function MemberPortalAttendance() {
  const { organization, profile } = useOrganization();

  const [stats, setStats] = React.useState<MemberAttendanceStats | null>(null);
  const [records, setRecords] = React.useState<MemberAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);

  const fetchData = React.useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);

    const [statsRes, historyRes] = await Promise.all([
      loadMemberMyAttendanceStats(organization.id),
      loadMemberAttendanceHistory(organization.id, { limit: 50 }),
    ]);

    setLoading(false);
    if (statsRes.data) setStats(statsRes.data);
    if (historyRes.data) setRecords(historyRes.data);
  }, [organization?.id]);

  React.useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Compute days present this month for the calendar
  const now = new Date();
  const currentMonthName = now.toLocaleString("default", { month: "long" });
  const currentYear = now.getFullYear();

  const attendedDaysSet = React.useMemo(() => {
    const s = new Set<number>();
    records.forEach((r) => {
      const d = new Date(r.checkInAt);
      if (d.getMonth() === now.getMonth() && d.getFullYear() === currentYear) {
        s.add(d.getDate());
      }
    });
    return s;
  }, [records, now, currentYear]);

  const daysInMonth = stats?.daysInMonth ?? 30;
  const daysArray = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">My Attendance</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Track your workout frequency, consistency streak, and check-in history.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchData()}
          disabled={loading}
          className="text-xs gap-1.5 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* KPI Stats Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Current Streak</span>
              <Flame className="w-4 h-4 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-ink">
              {stats?.currentStreak ?? 0}{" "}
              <span className="text-xs font-semibold text-neutral-500">days</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {(stats?.currentStreak ?? 0) > 0 ? "🔥 Keep the momentum going!" : "Check in today to start streak"}
            </p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>{currentMonthName} Visits</span>
              <Calendar className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {stats?.monthDaysPresent ?? 0}{" "}
              <span className="text-xs font-semibold text-neutral-500">days</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {stats?.monthVisits ?? 0} total check-ins this month
            </p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Monthly Consistency</span>
              <TrendingUp className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {stats?.attendancePercentage ?? 0}%
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              Active gym visit rate in {currentMonthName}
            </p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Total Lifetime Visits</span>
              <CheckCircle className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {stats?.totalVisits ?? 0}{" "}
              <span className="text-xs font-semibold text-neutral-500">visits</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">All verified check-ins on record</p>
          </CardContent>
        </Card>
      </div>

      {/* Monthly Attendance Calendar */}
      <Card className="border-neutral-200 bg-white">
        <CardHeader className="pb-3 border-b border-neutral-100 flex flex-row items-center justify-between">
          <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
            <Calendar className="w-4 h-4 text-teal-600" />
            {currentMonthName} {currentYear} Workout Activity
          </CardTitle>
          <div className="flex items-center gap-3 text-xs text-neutral-500">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-teal-600" /> Attended
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-sm bg-neutral-100 border border-neutral-200" /> Rest Day
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          <div className="grid grid-cols-7 sm:grid-cols-10 md:grid-cols-15 gap-1.5">
            {daysArray.map((day) => {
              const attended = attendedDaysSet.has(day);
              const isToday = day === now.getDate();

              return (
                <div
                  key={day}
                  className={`h-11 rounded-lg flex flex-col items-center justify-center border text-xs transition-colors ${
                    attended
                      ? "bg-teal-600 border-teal-700 text-white font-bold shadow-xs"
                      : isToday
                      ? "border-teal-500 bg-teal-50/50 text-teal-800 font-semibold"
                      : "bg-neutral-50/60 border-neutral-200 text-neutral-600"
                  }`}
                >
                  <span className="text-[11px]">{day}</span>
                  {attended && <CheckCircle className="w-3 h-3 text-white mt-0.5" />}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* History Table */}
      <Card className="border-neutral-200 bg-white">
        <CardHeader className="pb-3 border-b border-neutral-100">
          <CardTitle className="text-sm font-bold text-ink flex items-center gap-2">
            <Clock className="w-4 h-4 text-teal-600" />
            Recent Check-in History
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {loading && records.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-teal-600" />
              Loading history...
            </div>
          ) : records.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              No attendance records recorded yet. Check in at the gym front desk to see your history!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 font-semibold uppercase text-[11px] border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Check-in</th>
                    <th className="py-2.5 px-3">Check-out</th>
                    <th className="py-2.5 px-3">Duration</th>
                    <th className="py-2.5 px-3">Method</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {records.map((r) => {
                    const inDate = new Date(r.checkInAt);
                    const outDate = r.checkOutAt ? new Date(r.checkOutAt) : null;

                    return (
                      <tr key={r.id} className="hover:bg-neutral-50/50">
                        <td className="py-2.5 px-3 font-semibold text-ink">
                          {inDate.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" })}
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">{r.branchName}</td>
                        <td className="py-2.5 px-3 font-medium text-ink">
                          {inDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                        </td>
                        <td className="py-2.5 px-3">
                          {outDate ? (
                            <span className="text-ink">
                              {outDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="text-amber-700 font-bold bg-amber-50 px-2 py-0.5 rounded-full text-[10px]">
                              In gym
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-neutral-700">
                          {r.durationMinutes !== null ? `${r.durationMinutes} min` : "—"}
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          <span className="px-2 py-0.5 rounded bg-neutral-100 text-[10px] font-medium">
                            {r.method}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
