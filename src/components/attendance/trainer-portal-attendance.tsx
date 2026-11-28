"use client";

import * as React from "react";
import { Clock, LogIn, LogOut, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { staffClockIn, staffClockOut, loadStaffAttendanceHistory, loadCurrentStaffShift } from "@/lib/attendance/client";
import type { StaffAttendanceRow } from "@/lib/attendance/types";

export function TrainerPortalAttendance() {
  const { organization, branches, currentBranch } = useOrganization();
  const { toast } = useToast();

  const [currentShift, setCurrentShift] = React.useState<StaffAttendanceRow | null>(null);
  const [checkingShift, setCheckingShift] = React.useState(true);
  const [records, setRecords] = React.useState<StaffAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [clockLoading, setClockLoading] = React.useState(false);

  const fetchShiftAndHistory = React.useCallback(async () => {
    if (!organization?.id) return;
    setCheckingShift(true);
    setLoading(true);

    const [shiftRes, historyRes] = await Promise.all([
      loadCurrentStaffShift(organization.id),
      loadStaffAttendanceHistory(organization.id, { limit: 50 }),
    ]);

    setCheckingShift(false);
    setLoading(false);

    if (shiftRes.data) setCurrentShift(shiftRes.data);
    else setCurrentShift(null);

    if (historyRes.data) setRecords(historyRes.data);
  }, [organization?.id]);

  React.useEffect(() => {
    void fetchShiftAndHistory();
  }, [fetchShiftAndHistory]);

  const handleClockIn = async () => {
    if (!organization?.id) return;
    const branchId = currentBranch?.id ?? branches[0]?.id;
    if (!branchId) return;

    setClockLoading(true);
    const res = await staffClockIn({
      organizationId: organization.id,
      branchId,
      method: "web",
    });
    setClockLoading(false);

    if (res.error) {
      toast({ title: "Clock-in Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({ title: "Clocked In", description: "Your training shift has started." });
    await fetchShiftAndHistory();
  };

  const handleClockOut = async () => {
    if (!organization?.id || !currentShift) return;

    setClockLoading(true);
    const res = await staffClockOut({
      organizationId: organization.id,
      recordId: currentShift.id,
    });
    setClockLoading(false);

    if (res.error) {
      toast({ title: "Clock-out Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({ title: "Clocked Out", description: "Your shift has ended and hours recorded." });
    await fetchShiftAndHistory();
  };

  // Aggregates for trainer
  const totalHoursWorked = React.useMemo(() => {
    return records.reduce((acc, r) => acc + (Number(r.workingHours) || 0), 0);
  }, [records]);

  return (
    <div className="space-y-5 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-ink">Trainer Attendance</h1>
          <p className="text-xs text-neutral-500 mt-0.5">
            Clock in/out for your floor & PT training shifts and review your hours.
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => void fetchShiftAndHistory()}
          disabled={loading}
          className="text-xs gap-1.5 self-start"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Clock-in / Clock-out Card */}
      <Card className="border-teal-200 bg-white shadow-xs">
        <CardContent className="pt-5 pb-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div
                className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold border ${
                  currentShift
                    ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                    : "bg-teal-50 border-teal-200 text-teal-700"
                }`}
              >
                <Clock className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-bold text-ink">
                    {currentShift ? "Shift in Progress" : "Off Duty"}
                  </h3>
                  <span
                    className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                      currentShift ? "bg-emerald-100 text-emerald-800" : "bg-neutral-100 text-neutral-600"
                    }`}
                  >
                    {currentShift ? "ON DUTY" : "OFF DUTY"}
                  </span>
                </div>
                <p className="text-xs text-neutral-500 mt-0.5">
                  {currentShift
                    ? `Clocked in at ${new Date(currentShift.checkInAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })} • ${currentShift.branchName}`
                    : `Active Branch: ${currentBranch?.name ?? "Main Branch"}`}
                </p>
              </div>
            </div>

            <div>
              {currentShift ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClockOut}
                  disabled={clockLoading}
                  className="border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 font-semibold gap-1.5"
                >
                  <LogOut className="w-4 h-4" />
                  {clockLoading ? "Clocking out..." : "Clock Out"}
                </Button>
              ) : (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleClockIn}
                  disabled={clockLoading || checkingShift}
                  className="font-semibold gap-1.5"
                >
                  <LogIn className="w-4 h-4" />
                  {clockLoading ? "Clocking in..." : "Clock In"}
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Summary */}
      <div className="grid grid-cols-2 gap-3">
        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-neutral-500 block">Total Shifts Logged</span>
            <span className="text-2xl font-black text-ink mt-0.5 block">{records.length}</span>
            <span className="text-[11px] text-neutral-500 mt-1 block">Completed shifts</span>
          </CardContent>
        </Card>
        <Card className="border-neutral-200 bg-white">
          <CardContent className="p-4">
            <span className="text-xs text-neutral-500 block">Total Working Hours</span>
            <span className="text-2xl font-black text-ink mt-0.5 block">
              {totalHoursWorked.toFixed(1)} <span className="text-xs font-medium text-neutral-500">hrs</span>
            </span>
            <span className="text-[11px] text-neutral-500 mt-1 block">Calculated from server check-in/out</span>
          </CardContent>
        </Card>
      </div>

      {/* Trainer Shifts Log */}
      <Card className="border-neutral-200 bg-white">
        <CardHeader className="pb-3 border-b border-neutral-100">
          <CardTitle className="text-sm font-bold text-ink">My Past Shifts</CardTitle>
        </CardHeader>
        <CardContent className="pt-3">
          {loading && records.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-teal-600" />
              Loading shifts...
            </div>
          ) : records.length === 0 ? (
            <div className="py-8 text-center text-xs text-neutral-500">
              No shifts recorded yet. Clock in to start tracking your attendance!
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-neutral-600">
                <thead className="bg-neutral-50 text-neutral-700 font-semibold uppercase text-[11px] border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Branch</th>
                    <th className="py-2.5 px-3">Clock In</th>
                    <th className="py-2.5 px-3">Clock Out</th>
                    <th className="py-2.5 px-3">Hours</th>
                    <th className="py-2.5 px-3">Status</th>
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
                            <span className="text-teal-700 font-bold bg-teal-50 px-2 py-0.5 rounded-full text-[10px]">
                              On Duty
                            </span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-neutral-800">
                          {r.workingHours !== null ? `${r.workingHours} hrs` : "—"}
                        </td>
                        <td className="py-2.5 px-3 capitalize">
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                            {r.status}
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
