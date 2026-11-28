"use client";

import * as React from "react";
import { UserCheck, Clock, LogIn, LogOut, Edit3, Download, RefreshCw, AlertCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import {
  staffClockIn,
  staffClockOut,
  correctStaffAttendance,
  adminRecordStaffAttendance,
  loadStaffAttendanceHistory,
  loadCurrentStaffShift,
} from "@/lib/attendance/client";
import { downloadCsvTable } from "@/lib/reports/csv";
import type { StaffAttendanceRow, StaffAttendanceStatus } from "@/lib/attendance/types";

export function StaffAttendanceTab({ refreshTrigger }: { refreshTrigger?: number }) {
  const { organization, branches, currentBranch, profile, can } = useOrganization();
  const { toast } = useToast();

  const canManageAttendance = can("attendance.manage");

  // Current user's open shift state
  const [currentShift, setCurrentShift] = React.useState<StaffAttendanceRow | null>(null);
  const [checkingShift, setCheckingShift] = React.useState(true);
  const [clockActionLoading, setClockActionLoading] = React.useState(false);

  // Staff history log state
  const [records, setRecords] = React.useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [totalCount, setTotalCount] = React.useState(0);
  const [branchFilter, setBranchFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");
  const [dateRange, setDateRange] = React.useState<string>("today");
  const [page, setPage] = React.useState(0);
  const limit = 25;

  // Correction modal state
  const [editingRecord, setEditingRecord] = React.useState<StaffAttendanceRow | null>(null);
  const [correctionCheckIn, setCorrectionCheckIn] = React.useState("");
  const [correctionCheckOut, setCorrectionCheckOut] = React.useState("");
  const [correctionStatus, setCorrectionStatus] = React.useState<StaffAttendanceStatus>("present");
  const [correctionReason, setCorrectionReason] = React.useState("");
  const [correctionNotes, setCorrectionNotes] = React.useState("");
  const [savingCorrection, setSavingCorrection] = React.useState(false);

  const getDateBounds = (range: string): { start?: string; end?: string } => {
    const today = new Date().toISOString().split("T")[0];
    if (range === "today") return { start: today, end: today };
    if (range === "7d") {
      const d = new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0];
      return { start: d, end: today };
    }
    if (range === "30d") {
      const d = new Date(Date.now() - 30 * 86400000).toISOString().split("T")[0];
      return { start: d, end: today };
    }
    return {};
  };

  const fetchShift = React.useCallback(async () => {
    if (!organization?.id) return;
    setCheckingShift(true);
    const res = await loadCurrentStaffShift(organization.id);
    setCheckingShift(false);
    if (res.data) {
      setCurrentShift(res.data);
    } else {
      setCurrentShift(null);
    }
  }, [organization?.id]);

  const fetchHistory = React.useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const bounds = getDateBounds(dateRange);
    const res = await loadStaffAttendanceHistory(organization.id, {
      branchId: branchFilter !== "all" ? branchFilter : undefined,
      status: statusFilter !== "all" ? statusFilter : undefined,
      startDate: bounds.start,
      endDate: bounds.end,
      limit,
      offset: page * limit,
    });
    setLoading(false);

    if (res.data) {
      setRecords(res.data);
      setTotalCount(res.total);
    }
  }, [organization?.id, branchFilter, statusFilter, dateRange, page]);

  React.useEffect(() => {
    void fetchShift();
    void fetchHistory();
  }, [fetchShift, fetchHistory, refreshTrigger]);

  const handleClockIn = async () => {
    if (!organization?.id) return;
    const branchId = currentBranch?.id ?? branches[0]?.id;
    if (!branchId) {
      toast({ title: "Branch required", description: "Please select an active branch.", variant: "error" });
      return;
    }

    setClockActionLoading(true);
    const res = await staffClockIn({
      organizationId: organization.id,
      branchId,
      method: "web",
    });
    setClockActionLoading(false);

    if (res.error) {
      toast({ title: "Clock-in Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({ title: "Clocked In", description: "Your shift has started. Have a productive shift!" });
    await fetchShift();
    await fetchHistory();
  };

  const handleClockOut = async () => {
    if (!organization?.id || !currentShift) return;

    setClockActionLoading(true);
    const res = await staffClockOut({
      organizationId: organization.id,
      recordId: currentShift.id,
    });
    setClockActionLoading(false);

    if (res.error) {
      toast({ title: "Clock-out Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({ title: "Clocked Out", description: "Your shift has ended and hours recorded." });
    await fetchShift();
    await fetchHistory();
  };

  const openCorrectionModal = (record: StaffAttendanceRow) => {
    setEditingRecord(record);
    setCorrectionCheckIn(record.checkInAt ? record.checkInAt.slice(0, 16) : "");
    setCorrectionCheckOut(record.checkOutAt ? record.checkOutAt.slice(0, 16) : "");
    setCorrectionStatus(record.status);
    setCorrectionReason("");
    setCorrectionNotes(record.notes ?? "");
  };

  const handleSaveCorrection = async () => {
    if (!organization?.id || !editingRecord) return;
    if (!correctionReason.trim()) {
      toast({
        title: "Reason Required",
        description: "You must provide a mandatory audit reason for altering attendance.",
        variant: "error",
      });
      return;
    }

    setSavingCorrection(true);
    const res = await correctStaffAttendance({
      organizationId: organization.id,
      recordId: editingRecord.id,
      checkInAt: new Date(correctionCheckIn).toISOString(),
      checkOutAt: correctionCheckOut ? new Date(correctionCheckOut).toISOString() : null,
      status: correctionStatus,
      reason: correctionReason.trim(),
      notes: correctionNotes.trim() || undefined,
    });
    setSavingCorrection(false);

    if (res.error) {
      toast({ title: "Correction Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({ title: "Attendance Corrected", description: "Audit trail and updated hours saved." });
    setEditingRecord(null);
    await fetchHistory();
  };

  const handleExportCsv = () => {
    if (records.length === 0) return;
    downloadCsvTable(
      `staff-attendance-${dateRange}-${new Date().toISOString().split("T")[0]}`,
      [
        { header: "Staff Name", value: (r) => r.staffName },
        { header: "Role", value: (r) => r.roleName },
        { header: "Branch", value: (r) => r.branchName },
        { header: "Clock In", value: (r) => r.checkInAt },
        { header: "Clock Out", value: (r) => r.checkOutAt ?? "On duty" },
        { header: "Working Hours", value: (r) => r.workingHours ?? "—" },
        { header: "Status", value: (r) => r.status },
        { header: "Method", value: (r) => r.method },
        { header: "Correction Reason", value: (r) => r.correctionReason ?? "" },
      ],
      records,
    );
  };

  return (
    <div className="space-y-4">
      {/* Staff Self-Service Clock Card */}
      <Card className="border-teal-200 bg-white shadow-xs">
        <CardContent className="pt-4 pb-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-teal-50 border border-teal-200 text-teal-700 flex items-center justify-center font-bold">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-ink">
                  {currentShift ? "You are Currently Clocked In" : "Ready to Start Your Shift?"}
                </h4>
                <p className="text-xs text-neutral-500">
                  {currentShift
                    ? `Clocked in at ${new Date(currentShift.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} (${currentShift.branchName})`
                    : `Active Branch: ${currentBranch?.name ?? "Main Branch"}`}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {currentShift ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClockOut}
                  disabled={clockActionLoading}
                  className="border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 font-semibold gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  {clockActionLoading ? "Clocking out..." : "Clock Out"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleClockIn}
                  disabled={clockActionLoading || checkingShift}
                  className="font-semibold gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  {clockActionLoading ? "Clocking in..." : "Clock In"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Staff Attendance History Log Card */}
      <Card className="border-neutral-200 bg-white shadow-xs">
        <CardHeader className="pb-3 border-b border-neutral-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-ink flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-600" />
              Staff Shifts & Working Hours ({totalCount})
            </CardTitle>
            <p className="text-xs text-neutral-500 mt-0.5">
              Verified staff clock-in/out records, calculated working hours, and audit trail
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={records.length === 0}
              className="text-xs gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => void fetchHistory()}
              disabled={loading}
              className="text-xs gap-1 text-neutral-500"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>

        <CardContent className="pt-4 space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                setPage(0);
              }}
              className="font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Date Range Filter"
            >
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
              <option value="all">All Time</option>
            </select>

            <select
              value={branchFilter}
              onChange={(e) => {
                setBranchFilter(e.target.value);
                setPage(0);
              }}
              className="font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Branch Filter"
            >
              <option value="all">All Branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>

            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setPage(0);
              }}
              className="font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Status Filter"
            >
              <option value="all">All Statuses</option>
              <option value="present">Present</option>
              <option value="late">Late</option>
              <option value="half_day">Half Day</option>
              <option value="absent">Absent</option>
              <option value="on_leave">On Leave</option>
            </select>
          </div>

          {/* Table */}
          {loading && records.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-teal-600" />
              Loading staff shifts...
            </div>
          ) : records.length === 0 ? (
            <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-lg">
              No staff shifts found for the selected period.
            </div>
          ) : (
            <div className="overflow-x-auto border border-neutral-200 rounded-lg">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 font-semibold uppercase text-[11px] tracking-wider border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Staff Name</th>
                    <th className="py-2.5 px-3">Role</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Clock In</th>
                    <th className="py-2.5 px-3">Clock Out</th>
                    <th className="py-2.5 px-3">Hours</th>
                    <th className="py-2.5 px-3">Status</th>
                    {canManageAttendance && <th className="py-2.5 px-3 text-right">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {records.map((r) => {
                    const inDate = new Date(r.checkInAt);
                    const outDate = r.checkOutAt ? new Date(r.checkOutAt) : null;

                    return (
                      <tr key={r.id} className="hover:bg-neutral-50/50">
                        <td className="py-2.5 px-3 font-semibold text-ink">
                          {r.staffName}
                          {r.correctionReason && (
                            <span
                              className="ml-1.5 text-[10px] text-amber-700 font-medium px-1.5 py-0.2 rounded bg-amber-50"
                              title={`Corrected: ${r.correctionReason}`}
                            >
                              Edited
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="capitalize px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 font-medium text-[10px]">
                            {r.roleName}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-neutral-600">{r.branchName}</td>
                        <td className="py-2.5 px-3 font-medium text-ink">
                          {inDate.toLocaleDateString([], { month: "short", day: "numeric" })}{" "}
                          <span className="text-neutral-500">
                            {inDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {outDate ? (
                            <span className="text-ink">
                              {outDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded-full text-[10px]">
                              <span className="w-1.5 h-1.5 rounded-full bg-teal-500 animate-pulse" />
                              On Duty
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-800">
                          {r.workingHours !== null ? `${r.workingHours} hrs` : "—"}
                        </td>
                        <td className="py-2.5 px-3">
                          <span
                            className={`px-2 py-0.5 rounded-full font-semibold text-[10px] capitalize ${
                              r.status === "present"
                                ? "bg-emerald-100 text-emerald-800"
                                : r.status === "late"
                                ? "bg-amber-100 text-amber-800"
                                : r.status === "half_day"
                                ? "bg-blue-100 text-blue-800"
                                : "bg-neutral-100 text-neutral-700"
                            }`}
                          >
                            {r.status.replace("_", " ")}
                          </span>
                        </td>
                        {canManageAttendance && (
                          <td className="py-2.5 px-3 text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 text-xs text-neutral-600 hover:text-ink gap-1"
                              onClick={() => openCorrectionModal(r)}
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                              Correct
                            </Button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Correction Modal */}
      {editingRecord && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl space-y-4 border border-neutral-200">
            <div className="flex items-center justify-between border-b border-neutral-100 pb-3">
              <h3 className="text-sm font-bold text-ink">Correct Staff Attendance</h3>
              <button
                type="button"
                onClick={() => setEditingRecord(null)}
                className="text-neutral-400 hover:text-neutral-600 text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-500">
              Editing attendance for <span className="font-semibold text-ink">{editingRecord.staffName}</span> (
              {editingRecord.roleName}).
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-neutral-700 mb-1">Check-in Time *</label>
                <Input
                  type="datetime-local"
                  value={correctionCheckIn}
                  onChange={(e) => setCorrectionCheckIn(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Check-out Time</label>
                <Input
                  type="datetime-local"
                  value={correctionCheckOut}
                  onChange={(e) => setCorrectionCheckOut(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Status</label>
                <select
                  value={correctionStatus}
                  onChange={(e) => setCorrectionStatus(e.target.value as StaffAttendanceStatus)}
                  className="w-full text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-700"
                >
                  <option value="present">Present</option>
                  <option value="late">Late</option>
                  <option value="half_day">Half Day</option>
                  <option value="absent">Absent</option>
                  <option value="on_leave">On Leave</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">
                  Correction Reason * (Mandatory for audit)
                </label>
                <Input
                  type="text"
                  placeholder="e.g. Forgot to clock out before closing shift"
                  value={correctionReason}
                  onChange={(e) => setCorrectionReason(e.target.value)}
                  className="h-8 text-xs"
                  required
                />
              </div>

              <div>
                <label className="block font-medium text-neutral-700 mb-1">Additional Notes</label>
                <Input
                  type="text"
                  placeholder="Optional notes..."
                  value={correctionNotes}
                  onChange={(e) => setCorrectionNotes(e.target.value)}
                  className="h-8 text-xs"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2 border-t border-neutral-100">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingRecord(null)}
                disabled={savingCorrection}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                onClick={handleSaveCorrection}
                disabled={savingCorrection || !correctionReason.trim()}
              >
                {savingCorrection ? "Saving..." : "Save Correction"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
