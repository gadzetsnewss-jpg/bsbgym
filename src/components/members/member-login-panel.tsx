"use client";

import * as React from "react";
import {
  AlertCircle,
  Building2,
  Check,
  CheckCircle2,
  Copy,
  Info,
  KeyRound,
  RotateCcw,
  Smartphone,
  Unlink,
  UserCheck,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useOrganization } from "@/components/auth/org-provider";
import {
  fetchGymMember,
  provisionLinkedLogin,
  resetLinkedLoginPassword,
  unlinkGymMemberUser,
} from "@/lib/org/gym-members";
import { normalizeContactNumber } from "@/lib/auth/username";

interface MemberLoginPanelProps {
  memberId: string;
  memberName: string;
  memberCode: string | null;
  phone?: string | null;
  dateOfBirth?: string | null;
  linkedUserId: string | null;
  onChanged?: () => void;
}

export function MemberLoginPanel({
  memberId,
  memberName,
  memberCode,
  phone: propPhone,
  dateOfBirth: propDob,
  linkedUserId,
  onChanged,
}: MemberLoginPanelProps) {
  const { toast } = useToast();
  const { organization, can } = useOrganization();
  const canManage = can("users.manage");

  const [saving, setSaving] = React.useState(false);
  const [localLinked, setLocalLinked] = React.useState<boolean | null>(null);
  const [copiedKey, setCopiedKey] = React.useState<string | null>(null);
  const [showHandover, setShowHandover] = React.useState(false);
  const [confirmReset, setConfirmReset] = React.useState(false);
  const [memberPhone, setMemberPhone] = React.useState<string | null>(propPhone ?? null);
  const [memberDob, setMemberDob] = React.useState<string | null>(propDob ?? null);

  React.useEffect(() => {
    setMemberPhone(propPhone ?? null);
    setMemberDob(propDob ?? null);
  }, [propPhone, propDob]);

  React.useEffect(() => {
    setLocalLinked(null);
  }, [linkedUserId]);

  React.useEffect(() => {
    if (!organization?.id || !memberId) return;
    if (memberPhone !== null && memberDob !== null) return;
    void fetchGymMember(organization.id, memberId).then((res) => {
      if (res.data) {
        setMemberPhone(res.data.phone);
        setMemberDob(res.data.dateOfBirth);
      }
    });
  }, [organization?.id, memberId, memberPhone, memberDob]);

  if (!canManage) return null;

  const isLinked = localLinked ?? Boolean(linkedUserId);
  const gymCode = organization?.slug ?? "—";
  const gymName = organization?.name ?? "BSB FitForge";

  const rawPhone = memberPhone?.trim() || "";
  const normalizedPhone = normalizeContactNumber(rawPhone);
  const nationalPhone = normalizedPhone ? normalizedPhone.replace("+91", "") : rawPhone;

  // Validation
  const hasValidPhone = Boolean(normalizedPhone);
  const hasDob = Boolean(memberDob && memberDob.trim() !== "");
  const canCreate = hasValidPhone && hasDob && Boolean(memberCode);

  const copyToClipboard = (text: string, key: string) => {
    void navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
    toast({ title: "Copied to clipboard", variant: "success" });
  };

  const handleCreateLogin = async () => {
    if (!canCreate || saving) return;
    setSaving(true);
    const result = await provisionLinkedLogin("member", memberId);
    setSaving(false);

    if (result.error) {
      toast({
        title: "Could not create member login",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Member login provisioned",
      description: "Temporary password set. The member must change it on first login.",
      variant: "success",
    });
    setLocalLinked(true);
    setShowHandover(true);
    onChanged?.();
  };

  const handleResetPassword = async () => {
    setSaving(true);
    const result = await resetLinkedLoginPassword("member", memberId);
    setSaving(false);

    if (result.error) {
      toast({
        title: "Could not reset password",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({
      title: "Password reset",
      description: "Password reset to initial temporary credentials. First-login password change re-enforced.",
      variant: "success",
    });
    setConfirmReset(false);
    setShowHandover(true);
    onChanged?.();
  };

  const handleUnlink = async () => {
    setSaving(true);
    const result = await unlinkGymMemberUser(memberId);
    setSaving(false);

    if (result.error) {
      toast({
        title: "Could not unlink login",
        description: result.error.message,
        variant: "error",
      });
      return;
    }

    toast({ title: "Member login unlinked", variant: "success" });
    setLocalLinked(false);
    setShowHandover(false);
    onChanged?.();
  };

  return (
    <Card className="space-y-5 rounded-2xl border border-neutral-200/80 bg-white p-5 shadow-xs">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-neutral-100 pb-4">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-teal-50 text-teal-700">
            <Smartphone className="size-4.5" />
          </div>
          <div>
            <h3 className="text-base font-semibold tracking-tight text-ink">Member Login Access</h3>
            <p className="text-xs text-neutral-500">
              Credentials for member self-service portal (/member/login)
            </p>
          </div>
        </div>
        <Badge tone={isLinked ? "success" : "warning"} withDot className="px-2.5 py-1 text-xs">
          {isLinked ? "Login Active" : "Login Not Created"}
        </Badge>
      </div>

      {/* Profile & Credentials Overview Grid */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {/* Name */}
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
            Member Name
          </p>
          <p className="mt-1 truncate text-sm font-semibold text-ink">{memberName}</p>
        </div>

        {/* Member Code */}
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
              Member Code
            </p>
            {memberCode && (
              <button
                type="button"
                onClick={() => copyToClipboard(memberCode, "code")}
                className="text-neutral-400 transition hover:text-ink"
                title="Copy Member Code"
              >
                {copiedKey === "code" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            )}
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-ink">{memberCode || "—"}</p>
        </div>

        {/* Registered Mobile (Login ID) */}
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
              Login ID (Mobile)
            </p>
            {hasValidPhone && (
              <button
                type="button"
                onClick={() => copyToClipboard(nationalPhone, "phone")}
                className="text-neutral-400 transition hover:text-ink"
                title="Copy Login Mobile Number"
              >
                {copiedKey === "phone" ? (
                  <Check className="size-3.5 text-emerald-600" />
                ) : (
                  <Copy className="size-3.5" />
                )}
              </button>
            )}
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-ink">
            {nationalPhone || "Missing phone"}
          </p>
        </div>

        {/* Gym Code */}
        <div className="rounded-xl border border-neutral-100 bg-neutral-50/60 p-3">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-medium tracking-wide text-neutral-500 uppercase">
              Gym Code
            </p>
            <button
              type="button"
              onClick={() => copyToClipboard(gymCode, "gym")}
              className="text-neutral-400 transition hover:text-ink"
              title="Copy Gym Code"
            >
              {copiedKey === "gym" ? (
                <Check className="size-3.5 text-emerald-600" />
              ) : (
                <Copy className="size-3.5" />
              )}
            </button>
          </div>
          <p className="mt-1 font-mono text-sm font-semibold text-teal-800">{gymCode}</p>
        </div>
      </div>

      {/* Validation Checklist if Not Created */}
      {!isLinked && (!hasValidPhone || !hasDob) && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50/60 p-3.5 text-xs text-amber-900">
          <AlertCircle className="mt-0.5 size-4 shrink-0 text-amber-600" />
          <div className="space-y-1">
            <p className="font-semibold">Member details missing for login provisioning</p>
            <ul className="list-disc pl-4 space-y-0.5 text-amber-800">
              {!hasValidPhone && (
                <li>A valid 10-digit Indian mobile number is required as the Login ID.</li>
              )}
              {!hasDob && (
                <li>Date of birth is required to calculate the initial temporary password.</li>
              )}
            </ul>
            <p className="pt-1 text-[11px] text-amber-700">
              Please edit the member profile and enter valid phone and date of birth details before creating login.
            </p>
          </div>
        </div>
      )}

      {/* Handover Instructions Banner / Card */}
      {showHandover && (
        <div className="rounded-xl border border-teal-200 bg-teal-50/50 p-4 text-xs text-teal-950">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="size-4 text-teal-600" />
              <p className="font-semibold text-sm text-teal-900">Member Handover Instructions</p>
            </div>
            <button
              type="button"
              onClick={() => setShowHandover(false)}
              className="text-xs text-teal-700 underline hover:text-teal-900"
            >
              Dismiss
            </button>
          </div>
          <p className="mt-1 text-teal-800">
            Provide the following details to <span className="font-semibold">{memberName}</span>:
          </p>
          <div className="mt-3 space-y-2 rounded-lg border border-teal-200/80 bg-white p-3 font-mono text-xs text-neutral-800">
            <div className="flex justify-between">
              <span className="text-neutral-500">Portal URL:</span>
              <span className="font-semibold text-teal-800">/member/login</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Gym Code:</span>
              <span className="font-semibold">{gymCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Login ID:</span>
              <span className="font-semibold">{nationalPhone}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-neutral-500">Temporary Password:</span>
              <span className="font-semibold">Last 4 mobile digits + 4-digit birth year (e.g. 50721998)</span>
            </div>
          </div>
          <p className="mt-2.5 text-[11px] text-teal-700">
            * Note: Upon first login, the member will be forced to change their password before accessing their dashboard.
          </p>
        </div>
      )}

      {/* Action Row */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        {isLinked ? (
          <>
            <div className="flex items-center gap-2 text-xs text-neutral-600">
              <UserCheck className="size-4 text-emerald-600" />
              <span>
                Login active for mobile <strong className="font-mono">{nationalPhone}</strong> in gym <strong className="font-mono">{gymCode}</strong>.
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {!confirmReset ? (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setConfirmReset(true)}
                  disabled={saving}
                >
                  <RotateCcw className="mr-1.5 size-3.5 text-neutral-600" />
                  Reset Member Password
                </Button>
              ) : (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium text-neutral-600">Reset to temp password?</span>
                  <Button
                    size="sm"
                    variant="primary"
                    isLoading={saving}
                    onClick={() => void handleResetPassword()}
                  >
                    Confirm Reset
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setConfirmReset(false)}
                    disabled={saving}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              <Button
                size="sm"
                variant="ghost"
                className="text-neutral-500 hover:text-red-600"
                onClick={() => void handleUnlink()}
                disabled={saving}
              >
                <Unlink className="mr-1 size-3.5" />
                Unlink
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-xs text-neutral-500">
              Temporary password will be generated automatically: last 4 digits of phone + birth year.
            </p>

            <Button
              size="sm"
              variant="primary"
              isLoading={saving}
              disabled={!canCreate || saving}
              onClick={() => void handleCreateLogin()}
            >
              <KeyRound className="mr-1.5 size-3.5" />
              Create Member Login
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}
