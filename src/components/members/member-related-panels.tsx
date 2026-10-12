"use client";

import * as React from "react";
import { Activity, BookOpen, CalendarCheck, CreditCard, Dumbbell, HeartPulse, Ruler, Salad, UserRound } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingState } from "@/components/ui/loading-state";
import { useOrganization } from "@/components/auth/org-provider";
import { fetchInvoices, fetchPayments } from "@/lib/billing/client";
import {
  fetchMemberActivity,
  fetchMemberAttendance,
  fetchMemberClassBookings,
  fetchMemberDietPlans,
  fetchMemberMeasurements,
  fetchMemberProgress,
  fetchMemberPtSessions,
  fetchMemberTrainerAssignments,
  fetchMemberWorkoutPlans,
  type MemberAttendanceRow,
  type MemberAuditRow,
  type MemberClassBookingRow,
  type MemberDietPlanRow,
  type MemberMeasurementRow,
  type MemberProgressRow,
  type MemberPtSessionRow,
  type MemberTrainerAssignmentRow,
  type MemberWorkoutPlanRow,
} from "@/lib/org/gym-members";
import { formatCurrency, formatDate, formatDateTime } from "@/lib/format";
import type { InvoiceRow, PaymentRow } from "@/lib/billing/types";

function humanLabel(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function MemberBillingPanel({ memberId }: { memberId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const currency = organization?.currency ?? "INR";
  const canViewBilling = can("billing.view");
  const canCreateInvoice = can("billing.create");
  const canViewPayments = can("payments.view");

  const [invoices, setInvoices] = React.useState<InvoiceRow[]>([]);
  const [payments, setPayments] = React.useState<PaymentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canViewBilling) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [invoiceResult, paymentResult] = await Promise.all([
      fetchInvoices({ organizationId: orgId, memberId, pageSize: 8 }),
      canViewPayments
        ? fetchPayments(orgId, { memberId, pageSize: 8 })
        : Promise.resolve({ data: { rows: [] as PaymentRow[] }, error: null }),
    ]);
    setLoading(false);
    if (invoiceResult.error) {
      setError(invoiceResult.error.message);
      return;
    }
    if (paymentResult.error) {
      setError(paymentResult.error.message);
      return;
    }
    setInvoices(invoiceResult.data.rows);
    setPayments(paymentResult.data.rows);
  }, [orgId, memberId, canViewBilling, canViewPayments]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canViewBilling) {
    return (
      <EmptyState
        icon={CreditCard}
        title="Billing is restricted"
        description="You do not have permission to view invoices for this member."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading billing…" />;

  return (
    <div className="space-y-6">
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-ink">Invoices</h3>
          {canCreateInvoice && (
            <ButtonLink href={`/billing/new-invoice?memberId=${memberId}`} size="sm">
              New invoice
            </ButtonLink>
          )}
        </div>
        {invoices.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="No invoices yet"
            description="Create an invoice for this member from Billing."
            action={
              canCreateInvoice
                ? { label: "New invoice", href: `/billing/new-invoice?memberId=${memberId}` }
                : undefined
            }
          />
        ) : (
          invoices.map((row) => (
            <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-ink">{row.invoiceNumber}</p>
                <p className="text-xs text-neutral-500">{formatDate(row.issueDate)}</p>
              </div>
              <div className="flex items-center gap-3">
                <StatusBadge status={humanLabel(row.status)} />
                <span className="text-sm tabular-nums text-ink">
                  {formatCurrency(row.total, currency)}
                </span>
                <ButtonLink href={`/billing/invoices/${row.id}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </div>
            </Card>
          ))
        )}
      </section>

      {canViewPayments && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Payments</h3>
            <ButtonLink href="/billing/payments" variant="outline" size="sm">
              All payments
            </ButtonLink>
          </div>
          {payments.length === 0 ? (
            <p className="text-sm text-neutral-500">No payments recorded for this member.</p>
          ) : (
            payments.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{formatCurrency(row.amount, currency)}</p>
                  <p className="text-xs text-neutral-500">
                    {humanLabel(row.method)} · {formatDateTime(row.paidAt)}
                    {row.invoiceNumber ? ` · ${row.invoiceNumber}` : ""}
                  </p>
                </div>
                <StatusBadge status={humanLabel(row.status || "recorded")} />
              </Card>
            ))
          )}
        </section>
      )}
    </div>
  );
}

export function MemberAttendancePanel({ memberId }: { memberId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("attendance.view");
  const canCreate = can("attendance.create");

  const [rows, setRows] = React.useState<MemberAttendanceRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMemberAttendance(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, memberId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="Attendance is restricted"
        description="You do not have permission to view attendance for this member."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading attendance…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={CalendarCheck}
        title="No check-ins yet"
        description="Attendance for this member will appear here."
        action={canCreate ? { label: "Record attendance", href: `/attendance/add?memberId=${memberId}` } : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {canCreate && (
        <div className="flex justify-end">
          <ButtonLink href={`/attendance/add?memberId=${memberId}`} size="sm">
            Record attendance
          </ButtonLink>
        </div>
      )}
      {rows.map((row) => (
        <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">{formatDateTime(row.checkInAt)}</p>
            <p className="text-xs text-neutral-500">
              {row.branchName} · {humanLabel(row.method)}
              {row.checkOutAt ? ` · Out ${formatDateTime(row.checkOutAt)}` : ""}
            </p>
          </div>
          <ButtonLink href={`/attendance/${row.id}`} variant="outline" size="sm">
            View
          </ButtonLink>
        </Card>
      ))}
    </div>
  );
}

export function MemberTrainerPanel({
  memberId,
  assignedTrainerName,
}: {
  memberId: string;
  assignedTrainerName: string | null;
}) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("trainers.view");
  const canAssign = can("trainers.assign");

  const [rows, setRows] = React.useState<MemberTrainerAssignmentRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMemberTrainerAssignments(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, memberId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <EmptyState
        icon={UserRound}
        title="Trainer history is restricted"
        description="You do not have permission to view trainer assignments."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading trainer assignments…" />;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-600">
          Current trainer: {assignedTrainerName ?? "Unassigned"}
        </p>
        {canAssign && (
          <ButtonLink href={`/trainers/assignments/add?memberId=${memberId}`} size="sm">
            {assignedTrainerName ? "Change trainer" : "Assign trainer"}
          </ButtonLink>
        )}
      </div>
      {rows.length === 0 ? (
        <EmptyState
          icon={UserRound}
          title="No trainer assignments"
          description="Assign a trainer from Trainers > Assignments."
          action={
            canAssign
              ? { label: "Assign trainer", href: `/trainers/assignments/add?memberId=${memberId}` }
              : undefined
          }
        />
      ) : (
        rows.map((row) => (
          <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-ink">{row.trainerName}</p>
              <p className="text-xs text-neutral-500">
                {formatDate(row.assignedAt)}
                {row.notes ? ` · ${row.notes}` : ""}
              </p>
            </div>
            <StatusBadge status={humanLabel(row.status)} />
          </Card>
        ))
      )}
    </div>
  );
}

export function MemberClassBookingsPanel({ memberId }: { memberId: string }) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canView = can("classes.view");
  const canBook = can("bookings.manage");

  const [rows, setRows] = React.useState<MemberClassBookingRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || !canView) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMemberClassBookings(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, memberId, canView]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canView) {
    return (
      <EmptyState
        icon={BookOpen}
        title="Classes are restricted"
        description="You do not have permission to view class bookings for this member."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading class bookings…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={BookOpen}
        title="No class bookings"
        description="Book this member into a class to see it listed here."
        action={canBook ? { label: "Book class", href: `/classes/bookings/add?memberId=${memberId}` } : undefined}
      />
    );
  }

  return (
    <div className="space-y-3">
      {canBook && (
        <div className="flex justify-end">
          <ButtonLink href={`/classes/bookings/add?memberId=${memberId}`} size="sm">
            Book class
          </ButtonLink>
        </div>
      )}
      {rows.map((row) => (
        <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium text-ink">{row.className}</p>
            <p className="text-xs text-neutral-500">
              {row.startsAt ? formatDateTime(row.startsAt) : "Unscheduled"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <StatusBadge status={humanLabel(row.status)} />
            <ButtonLink href={`/classes/bookings/${row.id}`} variant="outline" size="sm">
              View
            </ButtonLink>
          </div>
        </Card>
      ))}
    </div>
  );
}

function fitnessHref(path: string, memberId: string, trainerId?: string | null) {
  const params = new URLSearchParams({ memberId });
  if (trainerId) params.set("trainerId", trainerId);
  return `${path}?${params.toString()}`;
}

export function MemberFitnessPanel({
  memberId,
  assignedTrainerId,
}: {
  memberId: string;
  assignedTrainerId?: string | null;
}) {
  const { organization, can } = useOrganization();
  const orgId = organization?.id;
  const canViewFitness = can("fitness.view");
  const canManageFitness = can("fitness.manage");
  const canViewTrainers = can("trainers.view");
  const canAssignTrainers = can("trainers.assign");

  const [workouts, setWorkouts] = React.useState<MemberWorkoutPlanRow[]>([]);
  const [diets, setDiets] = React.useState<MemberDietPlanRow[]>([]);
  const [measurements, setMeasurements] = React.useState<MemberMeasurementRow[]>([]);
  const [progress, setProgress] = React.useState<MemberProgressRow[]>([]);
  const [ptSessions, setPtSessions] = React.useState<MemberPtSessionRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId || (!canViewFitness && !canViewTrainers)) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const [workoutResult, dietResult, measurementResult, progressResult, ptResult] =
      await Promise.all([
        canViewFitness
          ? fetchMemberWorkoutPlans(orgId, memberId)
          : Promise.resolve({ data: [] as MemberWorkoutPlanRow[], error: null }),
        canViewFitness
          ? fetchMemberDietPlans(orgId, memberId)
          : Promise.resolve({ data: [] as MemberDietPlanRow[], error: null }),
        canViewFitness
          ? fetchMemberMeasurements(orgId, memberId)
          : Promise.resolve({ data: [] as MemberMeasurementRow[], error: null }),
        canViewFitness
          ? fetchMemberProgress(orgId, memberId)
          : Promise.resolve({ data: [] as MemberProgressRow[], error: null }),
        canViewTrainers
          ? fetchMemberPtSessions(orgId, memberId)
          : Promise.resolve({ data: [] as MemberPtSessionRow[], error: null }),
      ]);
    setLoading(false);
    const firstError =
      workoutResult.error ??
      dietResult.error ??
      measurementResult.error ??
      progressResult.error ??
      ptResult.error;
    if (firstError) {
      setError(firstError.message);
      return;
    }
    setWorkouts(workoutResult.data ?? []);
    setDiets(dietResult.data ?? []);
    setMeasurements(measurementResult.data ?? []);
    setProgress(progressResult.data ?? []);
    setPtSessions(ptResult.data ?? []);
  }, [orgId, memberId, canViewFitness, canViewTrainers]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (!canViewFitness && !canViewTrainers) {
    return (
      <EmptyState
        icon={Dumbbell}
        title="Fitness is restricted"
        description="You do not have permission to view fitness data for this member."
      />
    );
  }
  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading fitness…" />;

  const workoutHref = fitnessHref("/fitness/workout-plans/add", memberId, assignedTrainerId);
  const dietHref = fitnessHref("/fitness/diet-plans/add", memberId, assignedTrainerId);
  const measurementHref = fitnessHref("/fitness/measurements/add", memberId);
  const progressHref = fitnessHref("/fitness/progress/add", memberId);
  const ptHref = fitnessHref("/trainers/pt-sessions/add", memberId, assignedTrainerId);

  return (
    <div className="space-y-6">
      {canViewFitness && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Workout plans</h3>
            {canManageFitness && (
              <ButtonLink href={workoutHref} size="sm">
                Add workout plan
              </ButtonLink>
            )}
          </div>
          {workouts.length === 0 ? (
            <EmptyState
              icon={Dumbbell}
              title="No workout plans"
              description="Create a workout plan for this member from Fitness."
              action={canManageFitness ? { label: "Add workout plan", href: workoutHref } : undefined}
            />
          ) : (
            workouts.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{row.name}</p>
                  <p className="text-xs text-neutral-500">
                    {row.goal ?? "No goal"}
                    {row.trainerName ? ` · ${row.trainerName}` : ""}
                    {" · "}
                    {formatDate(row.startDate)} – {formatDate(row.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.isActive ? "Active" : "Inactive"} />
                  <ButtonLink href={`/fitness/workout-plans/${row.id}`} variant="outline" size="sm">
                    View
                  </ButtonLink>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {canViewFitness && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Diet plans</h3>
            {canManageFitness && (
              <ButtonLink href={dietHref} size="sm">
                Add diet plan
              </ButtonLink>
            )}
          </div>
          {diets.length === 0 ? (
            <EmptyState
              icon={Salad}
              title="No diet plans"
              description="Create a diet plan for this member from Fitness."
              action={canManageFitness ? { label: "Add diet plan", href: dietHref } : undefined}
            />
          ) : (
            diets.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{row.name}</p>
                  <p className="text-xs text-neutral-500">
                    {row.trainerName ?? "No trainer"}
                    {" · "}
                    {formatDate(row.startDate)} – {formatDate(row.endDate)}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={row.isActive ? "Active" : "Inactive"} />
                  <ButtonLink href={`/fitness/diet-plans/${row.id}`} variant="outline" size="sm">
                    View
                  </ButtonLink>
                </div>
              </Card>
            ))
          )}
        </section>
      )}

      {canViewFitness && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Measurements</h3>
            {canManageFitness && (
              <ButtonLink href={measurementHref} size="sm">
                Add measurement
              </ButtonLink>
            )}
          </div>
          {measurements.length === 0 ? (
            <EmptyState
              icon={Ruler}
              title="No measurements"
              description="Record this member's body measurements to track progress."
              action={canManageFitness ? { label: "Add measurement", href: measurementHref } : undefined}
            />
          ) : (
            measurements.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{formatDate(row.measuredAt)}</p>
                  <p className="text-xs text-neutral-500">
                    {[
                      row.weightKg != null ? `${row.weightKg} kg` : null,
                      row.bodyFatPercent != null ? `${row.bodyFatPercent}% body fat` : null,
                      row.waistCm != null ? `${row.waistCm} cm waist` : null,
                    ]
                      .filter(Boolean)
                      .join(" · ") || "No values"}
                  </p>
                </div>
                <ButtonLink href={`/fitness/measurements/${row.id}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </Card>
            ))
          )}
        </section>
      )}

      {canViewFitness && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">Progress</h3>
            {canManageFitness && (
              <ButtonLink href={progressHref} size="sm">
                Add progress
              </ButtonLink>
            )}
          </div>
          {progress.length === 0 ? (
            <EmptyState
              icon={HeartPulse}
              title="No progress entries"
              description="Log a progress entry for this member."
              action={canManageFitness ? { label: "Add progress", href: progressHref } : undefined}
            />
          ) : (
            progress.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{formatDate(row.entryDate)}</p>
                  <p className="text-xs text-neutral-500">
                    {[row.weightKg != null ? `${row.weightKg} kg` : null, row.notes]
                      .filter(Boolean)
                      .join(" · ") || "No details"}
                  </p>
                </div>
                <ButtonLink href={`/fitness/progress/${row.id}`} variant="outline" size="sm">
                  View
                </ButtonLink>
              </Card>
            ))
          )}
        </section>
      )}

      {canViewTrainers && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-ink">PT sessions</h3>
            {canAssignTrainers && (
              <ButtonLink href={ptHref} size="sm">
                Schedule PT
              </ButtonLink>
            )}
          </div>
          {ptSessions.length === 0 ? (
            <EmptyState
              icon={CalendarCheck}
              title="No PT sessions"
              description="Schedule a PT session for this member."
              action={canAssignTrainers ? { label: "Schedule PT", href: ptHref } : undefined}
            />
          ) : (
            ptSessions.map((row) => (
              <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-ink">{row.trainerName}</p>
                  <p className="text-xs text-neutral-500">
                    {formatDateTime(row.scheduledAt)}
                    {row.durationMinutes ? ` · ${row.durationMinutes} min` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <StatusBadge status={humanLabel(row.status)} />
                  <ButtonLink href={`/trainers/pt-sessions/${row.id}`} variant="outline" size="sm">
                    View
                  </ButtonLink>
                </div>
              </Card>
            ))
          )}
        </section>
      )}
    </div>
  );
}

export function MemberActivityPanel({ memberId }: { memberId: string }) {
  const { organization } = useOrganization();
  const orgId = organization?.id;

  const [rows, setRows] = React.useState<MemberAuditRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await fetchMemberActivity(orgId, memberId);
    setLoading(false);
    if (result.error) {
      setError(result.error.message);
      return;
    }
    setRows(result.data);
  }, [orgId, memberId]);

  React.useEffect(() => {
    void load();
  }, [load]);

  if (error) return <ErrorState description={error} onRetry={() => void load()} />;
  if (loading) return <LoadingState label="Loading activity…" />;
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={Activity}
        title="No activity yet"
        description="Status changes and profile updates for this member will appear here."
      />
    );
  }

  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <Card key={row.id} className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-medium text-ink">{humanLabel(row.action)}</p>
          <p className="text-xs text-neutral-500">{formatDateTime(row.createdAt)}</p>
        </Card>
      ))}
    </div>
  );
}
