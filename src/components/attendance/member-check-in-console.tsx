"use client";

import * as React from "react";
import { Search, QrCode, CheckCircle2, XCircle, AlertCircle, LogOut, ArrowRight, UserCheck, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { lookupMemberForAttendance, checkInMember, checkOutMember } from "@/lib/attendance/client";
import type { AttendanceMethod, MemberLookupResult } from "@/lib/attendance/types";

export function MemberCheckInConsole({ onCheckInSuccess }: { onCheckInSuccess?: () => void }) {
  const { organization, branches, currentBranch } = useOrganization();
  const { toast } = useToast();

  const [selectedBranchId, setSelectedBranchId] = React.useState<string>(
    currentBranch?.id ?? branches[0]?.id ?? "",
  );
  const [method, setMethod] = React.useState<AttendanceMethod>("manual");
  const [searchQuery, setSearchQuery] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [searching, setSearching] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [lookupResult, setLookupResult] = React.useState<MemberLookupResult | null>(null);
  const [searchFeedback, setSearchFeedback] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedBranchId && branches.length > 0) {
      setSelectedBranchId(branches[0].id);
    }
  }, [branches, selectedBranchId]);

  const handleSearch = async (queryToSearch: string) => {
    const q = queryToSearch.trim();
    if (!q || !organization?.id) {
      setLookupResult(null);
      setSearchFeedback(null);
      return;
    }

    setSearching(true);
    setSearchFeedback(null);
    const result = await lookupMemberForAttendance(organization.id, q, selectedBranchId);
    setSearching(false);

    if (result.error) {
      toast({ title: "Lookup Failed", description: result.error.message, variant: "error" });
      setLookupResult(null);
      return;
    }

    if (!result.data) {
      setLookupResult(null);
      setSearchFeedback(`No member found matching "${q}". Check the member code or phone number.`);
    } else {
      setLookupResult(result.data);
      setSearchFeedback(null);
    }
  };

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void handleSearch(searchQuery);
  };

  const handleCheckIn = async () => {
    if (!organization?.id || !lookupResult || !selectedBranchId) return;

    setSubmitting(true);
    const res = await checkInMember({
      organizationId: organization.id,
      branchId: selectedBranchId,
      memberId: lookupResult.member.id,
      method,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);

    if (res.error) {
      toast({
        title: "Check-in Denied",
        description: res.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Check-in Successful",
      description: `${lookupResult.member.fullName} checked in at ${branches.find((b) => b.id === selectedBranchId)?.name ?? "Branch"}.`,
    });

    setNotes("");
    // Refresh member lookup status to reflect new active check-in
    await handleSearch(searchQuery);
    onCheckInSuccess?.();
  };

  const handleCheckOut = async () => {
    if (!organization?.id || !lookupResult?.activeCheckIn) return;

    setSubmitting(true);
    const res = await checkOutMember({
      organizationId: organization.id,
      recordId: lookupResult.activeCheckIn.recordId,
      notes: notes.trim() || undefined,
    });
    setSubmitting(false);

    if (res.error) {
      toast({
        title: "Check-out Failed",
        description: res.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Checked Out",
      description: `${lookupResult.member.fullName} has been checked out.`,
    });

    setNotes("");
    await handleSearch(searchQuery);
    onCheckInSuccess?.();
  };

  const member = lookupResult?.member;
  const membership = lookupResult?.membership;
  const activeCheckIn = lookupResult?.activeCheckIn;

  return (
    <Card className="border-teal-200 bg-white shadow-sm">
      <CardHeader className="pb-3 border-b border-neutral-100 bg-neutral-50/50">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <CardTitle className="text-base font-semibold text-ink flex items-center gap-2">
              <UserCheck className="w-5 h-5 text-teal-600" />
              Front Desk Check-in Console
            </CardTitle>
            <p className="text-xs text-neutral-500 mt-0.5">
              Quick member lookup by Code, Name, Mobile, or QR Scanner
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Select Branch"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as AttendanceMethod)}
              className="text-xs font-medium rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-neutral-700 shadow-xs focus:border-teal-500 focus:outline-hidden"
              aria-label="Attendance Method"
            >
              <option value="manual">Manual</option>
              <option value="qr">QR Scanner</option>
              <option value="app">Member App</option>
              <option value="biometric">Biometric</option>
            </select>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Search Bar */}
        <form onSubmit={handleFormSubmit} className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-400" />
            <Input
              type="text"
              placeholder="Enter Member Code (e.g. MEM-101), Phone number, or scan QR..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 h-10 text-sm font-medium"
              autoFocus
            />
          </div>
          <Button type="submit" variant="primary" disabled={searching || !searchQuery.trim()} className="px-5">
            {searching ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Lookup"}
          </Button>
          {lookupResult && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setLookupResult(null);
                setSearchFeedback(null);
                setNotes("");
              }}
            >
              Clear
            </Button>
          )}
        </form>

        {searchFeedback && (
          <div className="p-3 text-xs bg-amber-50 text-amber-800 rounded-lg border border-amber-200 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-600" />
            <span>{searchFeedback}</span>
          </div>
        )}

        {/* Member Preview & Verification Card */}
        {lookupResult && member && (
          <div className="p-4 rounded-xl border border-neutral-200 bg-neutral-50/70 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-full bg-teal-100 text-teal-800 font-bold flex items-center justify-center text-base border border-teal-200 shrink-0">
                  {member.fullName
                    .split(" ")
                    .map((n) => n[0])
                    .join("")
                    .slice(0, 2)
                    .toUpperCase()}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-base font-bold text-ink">{member.fullName}</h4>
                    {member.code && (
                      <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded-md bg-neutral-200 text-neutral-800">
                        {member.code}
                      </span>
                    )}
                    <span
                      className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        member.status === "active"
                          ? "bg-emerald-100 text-emerald-800"
                          : "bg-red-100 text-red-800"
                      }`}
                    >
                      {member.status.toUpperCase()}
                    </span>
                  </div>
                  <div className="text-xs text-neutral-500 mt-1 flex flex-wrap gap-x-3 gap-y-1">
                    {member.phone && <span>📞 {member.phone}</span>}
                    {member.email && <span>✉️ {member.email}</span>}
                    <span>📍 Home: {member.branchName}</span>
                  </div>
                </div>
              </div>

              {/* Status Badge */}
              <div className="flex sm:flex-col items-end gap-1">
                {activeCheckIn ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-100 text-amber-900 text-xs font-bold border border-amber-300">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    Currently In Gym ({activeCheckIn.branchName})
                  </div>
                ) : lookupResult.canCheckIn ? (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-900 text-xs font-bold border border-emerald-300">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    Eligible for Check-in
                  </div>
                ) : (
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-100 text-rose-900 text-xs font-bold border border-rose-300">
                    <XCircle className="w-4 h-4 text-rose-600" />
                    Check-in Denied
                  </div>
                )}
                {activeCheckIn && (
                  <span className="text-[11px] text-neutral-500">
                    In since {new Date(activeCheckIn.checkInAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                )}
              </div>
            </div>

            {/* Membership Details Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-neutral-200/80 text-xs">
              <div>
                <span className="text-neutral-500 block">Plan</span>
                <span className="font-semibold text-ink">{membership?.planName ?? "None"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Membership Status</span>
                <span
                  className={`font-semibold capitalize ${
                    membership?.status === "active"
                      ? "text-emerald-700"
                      : membership?.status === "expired"
                      ? "text-rose-700"
                      : "text-neutral-700"
                  }`}
                >
                  {membership ? membership.status : "No Active Plan"}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block">Valid Until</span>
                <span className="font-semibold text-ink">{membership?.endDate ?? "—"}</span>
              </div>
              <div>
                <span className="text-neutral-500 block">Freeze Status</span>
                <span className={`font-semibold ${membership?.isFrozen ? "text-amber-700" : "text-neutral-600"}`}>
                  {membership?.isFrozen ? `Frozen till ${membership.freezeEndDate}` : "Active / No Freeze"}
                </span>
              </div>
            </div>

            {/* Denial Reason Alert if not eligible */}
            {!lookupResult.canCheckIn && !activeCheckIn && lookupResult.denialReason && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span className="font-medium">{lookupResult.denialReason}</span>
              </div>
            )}

            {/* Check-in / Check-out Action Area */}
            <div className="pt-2 flex flex-col sm:flex-row items-center gap-3">
              <Input
                type="text"
                placeholder="Optional visit notes (e.g. Guest pass, Leg day, PT session)..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="h-9 text-xs"
              />
              <div className="flex gap-2 w-full sm:w-auto shrink-0">
                {activeCheckIn ? (
                  <Button
                    type="button"
                    variant="outline"
                    className="border-amber-400 text-amber-900 bg-amber-50 hover:bg-amber-100 font-semibold gap-1.5 w-full sm:w-auto"
                    onClick={handleCheckOut}
                    disabled={submitting}
                  >
                    <LogOut className="w-4 h-4" />
                    {submitting ? "Checking out..." : "Check-out Member"}
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="primary"
                    className="font-semibold gap-1.5 w-full sm:w-auto"
                    disabled={!lookupResult.canCheckIn || submitting}
                    onClick={handleCheckIn}
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    {submitting ? "Checking in..." : "Confirm Check-in"}
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
