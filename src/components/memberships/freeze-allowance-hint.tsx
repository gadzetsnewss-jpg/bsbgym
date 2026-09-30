"use client";

import * as React from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";
import type { ResourceValues } from "@/lib/crud/types";
import { inclusiveDayCount, remainingDaysFromToday, remainingFreezeDays } from "@/lib/operations/freeze";
import { formatDate } from "@/lib/format";

type AnyTable = "gym_members";

interface FreezeMembershipSummary {
  memberName: string;
  planName: string;
  endDate: string;
  freezeDaysUsed: number;
  planMaxFreezeDays: number;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : value == null ? "" : String(value);
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === "number" && !Number.isNaN(value)) return value;
  const parsed = Number(value);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function embed(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  return (Array.isArray(value) ? value[0] : value) as Record<string, unknown> | null;
}

function displayName(record: Record<string, unknown> | null, fallback: string): string {
  if (!record) return fallback;
  if (record.full_name) return asString(record.full_name);
  const joined = [record.first_name, record.last_name].filter(Boolean).join(" ").trim();
  return joined || asString(record.name) || fallback;
}

export function FreezeAllowanceHint({
  values,
  organizationId,
}: {
  values: ResourceValues;
  organizationId: string;
}) {
  const membershipId = typeof values.membershipId === "string" ? values.membershipId : "";
  const startDate = typeof values.startDate === "string" ? values.startDate : "";
  const endDate = typeof values.endDate === "string" ? values.endDate : "";
  const [summary, setSummary] = React.useState<FreezeMembershipSummary | null>(null);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!organizationId || !membershipId) {
      setSummary(null);
      setLoading(false);
      return;
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    let cancelled = false;
    setLoading(true);
    void Promise.resolve(
      supabase
        .from("memberships" as AnyTable)
        .select(
          "end_date, freeze_days_used, gym_members(full_name, first_name, last_name, code), membership_plans(name, code, duration_days, max_freeze_days)",
        )
        .eq("organization_id", organizationId)
        .eq("id", membershipId)
        .maybeSingle(),
    ).then(
      ({ data }) => {
        if (cancelled) return;
        setLoading(false);
        if (!data) {
          setSummary(null);
          return;
        }
        const row = data as unknown as Record<string, unknown>;
        const plan = embed(row.membership_plans);
        setSummary({
          memberName: displayName(embed(row.gym_members), "Member"),
          planName: displayName(plan, "Plan"),
          endDate: asString(row.end_date).slice(0, 10),
          freezeDaysUsed: asNumber(row.freeze_days_used),
          planMaxFreezeDays: asNumber(plan?.max_freeze_days),
        });
      },
      () => {
        if (cancelled) return;
        setLoading(false);
        setSummary(null);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [organizationId, membershipId]);

  if (!membershipId) return null;

  const freezeLeft = summary ? remainingFreezeDays(summary.freezeDaysUsed, summary.planMaxFreezeDays) : 0;
  const durationLeft = summary ? remainingDaysFromToday(summary.endDate) : 0;
  const selectedDays = inclusiveDayCount(startDate, endDate);
  const overAllowance = Boolean(summary && selectedDays > freezeLeft);

  return (
    <div className="rounded-card border border-border bg-neutral-50 px-4 py-3 text-sm text-neutral-700">
      {loading ? (
        <p>Loading freeze allowance…</p>
      ) : summary ? (
        <>
          <p className="font-medium text-ink">
            {summary.memberName} · {summary.planName}
          </p>
          <p className="mt-1">
            {summary.freezeDaysUsed} of {summary.planMaxFreezeDays} freeze days used · {freezeLeft} remaining.
            Membership ends {formatDate(summary.endDate)}
            {durationLeft > 0 ? ` · ${durationLeft} day${durationLeft === 1 ? "" : "s"} remaining` : " · ended or ending today"}.
          </p>
          {selectedDays > 0 && (
            <p className={overAllowance ? "mt-1 text-red-700" : "mt-1"}>
              This freeze is {selectedDays} day{selectedDays === 1 ? "" : "s"}
              {overAllowance ? " and exceeds the remaining allowance." : "."}
            </p>
          )}
        </>
      ) : (
        <p>Select a membership to see remaining freeze days and duration.</p>
      )}
    </div>
  );
}
