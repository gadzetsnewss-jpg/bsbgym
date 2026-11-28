"use client";

import * as React from "react";
import { Download, Search, Filter, Calendar, RefreshCw, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useOrganization } from "@/components/auth/org-provider";
import { loadMemberAttendanceHistory } from "@/lib/attendance/client";
import { downloadCsvTable } from "@/lib/reports/csv";
import type { MemberAttendanceRow } from "@/lib/attendance/types";

export function MemberAttendanceLog({ refreshTrigger }: { refreshTrigger?: number }) {
  const { organization, branches } = useOrganization();

  const [branchFilter, setBranchFilter] = React.useState<string>("all");
  const [methodFilter, setMethodFilter] = React.useState<string>("all");
  const [dateRange, setDateRange] = React.useState<string>("today");
  const [search, setSearch] = React.useState("");
  const [loading, setLoading] = React.useState(true);
  const [records, setRecords] = React.useState<MemberAttendanceRow[]>([]);
  const [totalCount, setTotalCount] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const limit = 25;

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

  const fetchRecords = React.useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const bounds = getDateBounds(dateRange);
    const res = await loadMemberAttendanceHistory(organization.id, {
      branchId: branchFilter !== "all" ? branchFilter : undefined,
      method: methodFilter !== "all" ? methodFilter : undefined,
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
  }, [organization?.id, branchFilter, methodFilter, dateRange, page]);

  React.useEffect(() => {
    void fetchRecords();
  }, [fetchRecords, refreshTrigger]);

  const handleExportCsv = () => {
    if (records.length === 0) return;
    downloadCsvTable(
      `member-attendance-${dateRange}-${new Date().toISOString().split("T")[0]}`,
      [
        { header: "Member Code", value: (r) => r.memberCode ?? "—" },
        { header: "Member Name", value: (r) => r.memberName },
        { header: "Branch", value: (r) => r.branchName },
        { header: "Check In", value: (r) => r.checkInAt },
        { header: "Check Out", value: (r) => r.checkOutAt ?? "Still in gym" },
        { header: "Duration (Mins)", value: (r) => r.durationMinutes ?? "—" },
        { header: "Method", value: (r) => r.method },
        { header: "Notes", value: (r) => r.notes ?? "" },
      ],
      records,
    );
  };

  const filteredRecords = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.memberName.toLowerCase().includes(q) ||
        (r.memberCode && r.memberCode.toLowerCase().includes(q)) ||
        (r.notes && r.notes.toLowerCase().includes(q)),
    );
  }, [records, search]);

  const totalPages = Math.ceil(totalCount / limit);

  return (
    <Card className="border-neutral-200 bg-white shadow-xs">
      <CardHeader className="pb-3 border-b border-neutral-100 flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <CardTitle className="text-base font-semibold text-ink flex items-center gap-2">
            <Clock className="w-5 h-5 text-teal-600" />
            Member Attendance History ({totalCount})
          </CardTitle>
          <p className="text-xs text-neutral-500 mt-0.5">
            Verified check-in and check-out logs with duration and method audit
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
            onClick={() => void fetchRecords()}
            disabled={loading}
            className="text-xs gap-1 text-neutral-500"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400" />
            <Input
              type="text"
              placeholder="Search member, code, or notes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <select
              value={dateRange}
              onChange={(e) => {
                setDateRange(e.target.value);
                setPage(0);
              }}
              className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
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
              className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
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
              value={methodFilter}
              onChange={(e) => {
                setMethodFilter(e.target.value);
                setPage(0);
              }}
              className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Method Filter"
            >
              <option value="all">All Methods</option>
              <option value="manual">Manual</option>
              <option value="qr">QR Scanner</option>
              <option value="app">Member App</option>
              <option value="biometric">Biometric</option>
            </select>
          </div>
        </div>

        {/* Attendance Records Table */}
        {loading && records.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-500">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-teal-600" />
            Loading attendance records...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="py-12 text-center text-xs text-neutral-500 border border-dashed border-neutral-200 rounded-lg">
            No attendance records found matching current filters.
          </div>
        ) : (
          <div className="overflow-x-auto border border-neutral-200 rounded-lg">
            <table className="w-full text-left text-xs text-neutral-600">
              <thead className="bg-neutral-50 text-neutral-700 font-semibold uppercase text-[11px] tracking-wider border-b border-neutral-200">
                <tr>
                  <th className="py-2.5 px-3">Member</th>
                  <th className="py-2.5 px-3">Branch</th>
                  <th className="py-2.5 px-3">Check-in</th>
                  <th className="py-2.5 px-3">Check-out</th>
                  <th className="py-2.5 px-3">Duration</th>
                  <th className="py-2.5 px-3">Method</th>
                  <th className="py-2.5 px-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {filteredRecords.map((r) => {
                  const inDate = new Date(r.checkInAt);
                  const outDate = r.checkOutAt ? new Date(r.checkOutAt) : null;

                  return (
                    <tr key={r.id} className="hover:bg-neutral-50/50">
                      <td className="py-2.5 px-3">
                        <div className="font-semibold text-ink">{r.memberName}</div>
                        {r.memberCode && (
                          <span className="font-mono text-[10px] text-neutral-500">
                            {r.memberCode}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-neutral-600">{r.branchName}</td>
                      <td className="py-2.5 px-3 text-ink font-medium">
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
                          <span className="inline-flex items-center gap-1 font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full text-[10px]">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            In gym
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-neutral-700">
                        {r.durationMinutes !== null ? `${r.durationMinutes} min` : "—"}
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded-md bg-neutral-100 text-neutral-700 font-medium capitalize text-[10px]">
                          {r.method}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-neutral-500 max-w-[200px] truncate">
                        {r.notes ?? "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between text-xs pt-2">
            <span className="text-neutral-500">
              Showing {page * limit + 1} - {Math.min((page + 1) * limit, totalCount)} of {totalCount}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-7 text-xs"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
