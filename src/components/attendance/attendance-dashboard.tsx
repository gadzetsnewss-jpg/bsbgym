"use client";

import * as React from "react";
import { Users, UserCheck, Clock, RefreshCw, Calendar, Flame } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useOrganization } from "@/components/auth/org-provider";
import { loadDailyAttendanceSummary } from "@/lib/attendance/client";
import { MemberCheckInConsole } from "./member-check-in-console";
import { ActiveMembersInGym } from "./active-members-in-gym";
import { MemberAttendanceLog } from "./member-attendance-log";
import { StaffAttendanceTab } from "./staff-attendance-tab";
import type { AttendanceDailySummary } from "@/lib/attendance/types";

export function AttendanceDashboard() {
  const { organization, branches, currentBranch } = useOrganization();

  const [activeTab, setActiveTab] = React.useState<"members" | "staff">("members");
  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(
    currentBranch?.id ?? "all",
  );
  const [summary, setSummary] = React.useState<AttendanceDailySummary | null>(null);
  const [loadingSummary, setLoadingSummary] = React.useState(true);
  const [refreshTrigger, setRefreshTrigger] = React.useState(0);

  const fetchSummary = React.useCallback(async () => {
    if (!organization?.id) return;
    setLoadingSummary(true);
    const res = await loadDailyAttendanceSummary(
      organization.id,
      selectedBranchId !== "all" ? selectedBranchId : undefined,
    );
    setLoadingSummary(false);
    if (res.data) {
      setSummary(res.data);
    }
  }, [organization?.id, selectedBranchId]);

  React.useEffect(() => {
    void fetchSummary();
  }, [fetchSummary, refreshTrigger]);

  const handleTriggerRefresh = () => {
    setRefreshTrigger((prev) => prev + 1);
  };

  return (
    <div className="space-y-6">
      {/* Top Header with Branch Filter & Refresh */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-ink tracking-tight">Attendance Management</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Real-time gym check-ins, member verification, and staff shift tracking.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
            aria-label="Filter Summary Branch"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>

          <Button
            variant="outline"
            size="sm"
            onClick={handleTriggerRefresh}
            disabled={loadingSummary}
            className="text-xs gap-1.5"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingSummary ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      {/* Real Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="border-neutral-200 bg-white shadow-2xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Members Today</span>
              <Users className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {loadingSummary ? "—" : summary?.membersToday ?? 0}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Unique members checked in today</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-2xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Currently In Gym</span>
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="text-2xl font-black text-emerald-700">
              {loadingSummary ? "—" : summary?.membersCurrentlyInGym ?? 0}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Active visits in progress</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-2xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Staff On Duty</span>
              <UserCheck className="w-4 h-4 text-teal-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {loadingSummary ? "—" : summary?.staffOnDuty ?? 0}
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">Active clocked-in staff</p>
          </CardContent>
        </Card>

        <Card className="border-neutral-200 bg-white shadow-2xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between text-neutral-500 text-xs mb-1">
              <span>Staff Hours Logged</span>
              <Clock className="w-4 h-4 text-neutral-600" />
            </div>
            <div className="text-2xl font-black text-ink">
              {loadingSummary ? "—" : summary?.staffTotalHours ?? 0}{" "}
              <span className="text-xs font-semibold text-neutral-500">hrs</span>
            </div>
            <p className="text-[11px] text-neutral-500 mt-1">
              {summary?.staffToday ?? 0} staff active today
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Tabs Navigation */}
      <div className="border-b border-neutral-200">
        <nav className="flex space-x-6" aria-label="Attendance Tabs">
          <button
            type="button"
            onClick={() => setActiveTab("members")}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "members"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-neutral-500 hover:text-ink hover:border-neutral-300"
            }`}
          >
            <Users className="w-4 h-4" />
            Member Attendance
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("staff")}
            className={`pb-3 text-sm font-bold border-b-2 flex items-center gap-2 transition-colors ${
              activeTab === "staff"
                ? "border-teal-600 text-teal-700"
                : "border-transparent text-neutral-500 hover:text-ink hover:border-neutral-300"
            }`}
          >
            <UserCheck className="w-4 h-4" />
            Staff Attendance
          </button>
        </nav>
      </div>

      {/* Tab 1: Member Attendance */}
      {activeTab === "members" && (
        <div className="space-y-6">
          {/* Top Section: Live Check-in Console + Active in Gym */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            <div className="lg:col-span-2">
              <MemberCheckInConsole onCheckInSuccess={handleTriggerRefresh} />
            </div>
            <div>
              <ActiveMembersInGym
                branchId={selectedBranchId !== "all" ? selectedBranchId : undefined}
                refreshTrigger={refreshTrigger}
                onCheckOutSuccess={handleTriggerRefresh}
              />
            </div>
          </div>

          {/* Historical Log */}
          <MemberAttendanceLog refreshTrigger={refreshTrigger} />
        </div>
      )}

      {/* Tab 2: Staff Attendance */}
      {activeTab === "staff" && (
        <StaffAttendanceTab refreshTrigger={refreshTrigger} />
      )}
    </div>
  );
}
