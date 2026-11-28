"use client";

import * as React from "react";
import { Users, Clock, LogOut, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import { loadActiveGymMembers, checkOutMember } from "@/lib/attendance/client";
import type { MemberAttendanceRow } from "@/lib/attendance/types";

export function ActiveMembersInGym({
  branchId,
  refreshTrigger,
  onCheckOutSuccess,
}: {
  branchId?: string;
  refreshTrigger?: number;
  onCheckOutSuccess?: () => void;
}) {
  const { organization } = useOrganization();
  const { toast } = useToast();

  const [activeMembers, setActiveMembers] = React.useState<MemberAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [checkingOutId, setCheckingOutId] = React.useState<string | null>(null);

  const fetchActive = React.useCallback(async () => {
    if (!organization?.id) return;
    setLoading(true);
    const res = await loadActiveGymMembers(organization.id, branchId);
    setLoading(false);
    if (res.data) {
      setActiveMembers(res.data);
    }
  }, [organization?.id, branchId]);

  React.useEffect(() => {
    void fetchActive();
  }, [fetchActive, refreshTrigger]);

  const handleCheckOut = async (record: MemberAttendanceRow) => {
    if (!organization?.id) return;
    setCheckingOutId(record.id);
    const res = await checkOutMember({
      organizationId: organization.id,
      recordId: record.id,
    });
    setCheckingOutId(null);

    if (res.error) {
      toast({ title: "Check-out Failed", description: res.error.message, variant: "error" });
      return;
    }

    toast({
      title: "Checked Out",
      description: `${record.memberName} has been checked out.`,
    });
    await fetchActive();
    onCheckOutSuccess?.();
  };

  return (
    <Card className="border-neutral-200 bg-white shadow-xs">
      <CardHeader className="pb-3 border-b border-neutral-100 flex flex-row items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-teal-600" />
          <CardTitle className="text-base font-semibold text-ink">
            Currently In Gym ({activeMembers.length})
          </CardTitle>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void fetchActive()}
          disabled={loading}
          className="text-xs text-neutral-500 hover:text-ink gap-1"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </CardHeader>

      <CardContent className="pt-3">
        {loading && activeMembers.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            <RefreshCw className="w-5 h-5 mx-auto mb-2 animate-spin text-teal-600" />
            Loading active members...
          </div>
        ) : activeMembers.length === 0 ? (
          <div className="py-8 text-center text-xs text-neutral-500">
            No members currently in the gym.
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {activeMembers.map((record) => (
              <div
                key={record.id}
                className="py-2.5 flex items-center justify-between gap-3 text-xs hover:bg-neutral-50/50 rounded-lg px-2"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-ink truncate">{record.memberName}</span>
                    {record.memberCode && (
                      <span className="font-mono text-[11px] px-1.5 py-0.2 rounded-md bg-neutral-100 text-neutral-600">
                        {record.memberCode}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-neutral-500 text-[11px] mt-0.5">
                    <span>📍 {record.branchName}</span>
                    <span className="flex items-center gap-1 text-teal-700 font-medium">
                      <Clock className="w-3 h-3" />
                      In for {record.durationMinutes ?? 0}m
                    </span>
                    <span>
                      Checked in at{" "}
                      {new Date(record.checkInAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 text-xs text-amber-800 border-amber-300 hover:bg-amber-50 gap-1 shrink-0"
                  disabled={checkingOutId === record.id}
                  onClick={() => handleCheckOut(record)}
                >
                  <LogOut className="w-3.5 h-3.5" />
                  {checkingOutId === record.id ? "Checking out..." : "Check-out"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
