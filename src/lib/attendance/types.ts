export type AttendanceMethod = "manual" | "qr" | "biometric" | "app" | "web";

export type StaffAttendanceStatus = "present" | "late" | "half_day" | "absent" | "on_leave";

export interface MemberLookupResult {
  member: {
    id: string;
    code: string | null;
    fullName: string;
    firstName: string;
    lastName: string;
    phone: string | null;
    email: string | null;
    avatarUrl?: string | null;
    status: "active" | "inactive" | "suspended";
    branchId: string;
    branchName: string;
  };
  membership: {
    id: string;
    planName: string;
    status: "active" | "pending" | "expired" | "cancelled" | "none";
    startDate: string;
    endDate: string;
    isFrozen: boolean;
    freezeEndDate?: string | null;
  } | null;
  activeCheckIn: {
    recordId: string;
    checkInAt: string;
    branchName: string;
    method: string;
  } | null;
  canCheckIn: boolean;
  denialReason?: string | null;
}

export interface MemberAttendanceRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  memberId: string;
  memberCode: string | null;
  memberName: string;
  memberPhone: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  method: AttendanceMethod;
  notes: string | null;
  durationMinutes: number | null;
}

export interface StaffAttendanceRow {
  id: string;
  organizationId: string;
  branchId: string;
  branchName: string;
  userId: string;
  staffName: string;
  roleName: string;
  roleSlug: string;
  trainerId?: string | null;
  checkInAt: string;
  checkOutAt: string | null;
  status: StaffAttendanceStatus;
  method: AttendanceMethod;
  workingHours: number | null;
  notes: string | null;
  correctionReason: string | null;
  correctedBy?: string | null;
  correctedAt?: string | null;
  deviceMetadata?: Record<string, unknown>;
}

export interface AttendanceDailySummary {
  date: string;
  membersToday: number;
  membersCurrentlyInGym: number;
  staffToday: number;
  staffOnDuty: number;
  staffTotalHours: number;
}

export interface MemberAttendanceStats {
  totalVisits: number;
  monthVisits: number;
  monthDaysPresent: number;
  currentStreak: number;
  attendancePercentage: number;
  daysInMonth: number;
}
