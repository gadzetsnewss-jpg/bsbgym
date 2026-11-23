"use client";

import * as React from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clock,
  LogOut,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Smartphone,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import type { GeneratedQrResult, QrStatusResult } from "@/lib/auth/trainer-qr";

interface TrainerQrPanelProps {
  trainerId: string;
  trainerName: string;
  trainerCode: string | null;
  linkedUserId: string | null;
}

export function TrainerQrPanel({
  trainerId,
  trainerName,
  trainerCode,
  linkedUserId,
}: TrainerQrPanelProps) {
  const { toast } = useToast();

  const [challenge, setChallenge] = React.useState<GeneratedQrResult | null>(null);
  const [status, setStatus] = React.useState<"idle" | "active" | "consumed" | "expired" | "revoked">(
    "idle",
  );
  const [remainingSeconds, setRemainingSeconds] = React.useState<number>(0);
  const [loading, setLoading] = React.useState(false);
  const [revoking, setRevoking] = React.useState(false);
  const [revokingDevices, setRevokingDevices] = React.useState(false);

  // Generate a fresh 90s QR challenge
  const handleGenerateQr = async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/auth/trainer-qr/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId }),
      });

      const data = await response.json();
      if (!response.ok || data.error) {
        toast({
          title: "Could not generate QR",
          description: data.error || "Failed to generate login QR.",
          variant: "error",
        });
        return;
      }

      setChallenge(data);
      setStatus("active");
      setRemainingSeconds(data.expiresInSeconds || 90);
      toast({
        title: "Trainer QR Generated",
        description: "Valid for 90 seconds. Ask trainer to scan with mobile camera.",
        variant: "success",
      });
    } catch {
      toast({
        title: "Network error",
        description: "Failed to connect to QR service.",
        variant: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  // Revoke active QR code
  const handleRevokeQr = async () => {
    setRevoking(true);
    try {
      const response = await fetch("/api/auth/trainer-qr/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId }),
      });

      if (!response.ok) {
        toast({ title: "Failed to revoke QR", variant: "error" });
        return;
      }

      setStatus("revoked");
      toast({ title: "QR Code Revoked" });
    } finally {
      setRevoking(false);
    }
  };

  // Revoke device sessions for this trainer
  const handleRevokeDeviceSessions = async () => {
    if (!confirm("Are you sure you want to sign out this trainer from all mobile devices?")) {
      return;
    }
    setRevokingDevices(true);
    try {
      const response = await fetch("/api/auth/trainer-qr/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trainerId, revokeAllDevices: true }),
      });

      if (!response.ok) {
        toast({ title: "Failed to revoke device sessions", variant: "error" });
        return;
      }

      setStatus("revoked");
      setChallenge(null);
      toast({
        title: "Device Sessions Revoked",
        description: "The trainer has been signed out of all mobile devices.",
        variant: "success",
      });
    } finally {
      setRevokingDevices(false);
    }
  };

  // 1-second countdown timer
  React.useEffect(() => {
    if (status !== "active" || remainingSeconds <= 0) {
      if (status === "active" && remainingSeconds <= 0) {
        setStatus("expired");
      }
      return;
    }

    const timer = setInterval(() => {
      setRemainingSeconds((prev) => {
        if (prev <= 1) {
          setStatus("expired");
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [status, remainingSeconds]);

  // Polling hook while QR is active
  React.useEffect(() => {
    if (!challenge || status !== "active") return;

    let active = true;
    const pollStatus = async () => {
      try {
        const res = await fetch(`/api/auth/trainer-qr/status?challengeId=${challenge.challengeId}`);
        if (!res.ok) return;
        const data: QrStatusResult = await res.json();
        if (!active) return;

        if (data.status === "consumed") {
          setStatus("consumed");
          toast({
            title: "Trainer Authenticated!",
            description: `${trainerName} scanned and signed in on mobile.`,
            variant: "success",
          });
        } else if (data.status === "expired") {
          setStatus("expired");
        } else if (data.status === "revoked") {
          setStatus("revoked");
        }
      } catch {
        // Continue polling
      }
    };

    const interval = setInterval(pollStatus, 2000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [challenge, status, trainerName, toast]);

  if (!linkedUserId) {
    return (
      <div className="rounded-xl border border-neutral-200/80 bg-neutral-50/60 p-4 text-xs text-neutral-500">
        <p className="font-semibold text-neutral-700">QR Login Unavailable</p>
        <p className="mt-1">
          Create an active trainer login above before generating single-use QR login codes.
        </p>
      </div>
    );
  }

  const progressPercent = Math.max(0, Math.min(100, (remainingSeconds / 90) * 100));

  return (
    <div className="space-y-4 rounded-xl border border-teal-200/80 bg-gradient-to-br from-white via-teal-50/20 to-teal-50/40 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-teal-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <Smartphone className="size-4 text-teal-700" />
            <h4 className="text-sm font-bold text-ink">Mobile QR Login (Captain Style)</h4>
            <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[10px] font-semibold text-teal-800">
              Single-use 90s
            </span>
          </div>
          <p className="mt-0.5 text-xs text-neutral-500">
            Generate an instant single-use QR for {trainerName} to scan with their phone camera.
          </p>
        </div>

        {status === "active" && (
          <Badge tone="success" withDot>
            Active &middot; {remainingSeconds}s
          </Badge>
        )}
        {status === "consumed" && (
          <Badge tone="success" withDot>
            Scanned &amp; Logged In
          </Badge>
        )}
        {status === "expired" && (
          <Badge tone="danger" withDot>
            Expired
          </Badge>
        )}
        {status === "revoked" && (
          <Badge tone="warning" withDot>
            Revoked
          </Badge>
        )}
      </div>

      {status === "idle" ? (
        <div className="flex flex-col items-center justify-center py-4 text-center sm:py-6">
          <div className="flex size-12 items-center justify-center rounded-full bg-teal-100 text-teal-700 shadow-sm">
            <QrCode className="size-6" />
          </div>
          <p className="mt-3 text-sm font-semibold text-ink">Instant Trainer QR Login</p>
          <p className="mt-1 max-w-sm text-xs text-neutral-500">
            Trainer scans the QR using their smartphone camera to log in instantly without typing their password.
          </p>
          <div className="mt-4">
            <Button size="md" onClick={() => void handleGenerateQr()} isLoading={loading} className="bg-primary-700 hover:bg-primary-800">
              <QrCode className="mr-1.5 size-4" />
              Generate Trainer QR
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Active QR View */}
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start sm:gap-6">
            {/* QR Image Box */}
            <div className="relative flex shrink-0 flex-col items-center rounded-2xl border border-neutral-200 bg-white p-3 shadow-md">
              {challenge?.qrSvg ? (
                <div
                  className="size-48 sm:size-52 [&>svg]:size-full"
                  dangerouslySetInnerHTML={{ __html: challenge.qrSvg }}
                />
              ) : (
                <div className="flex size-48 items-center justify-center bg-neutral-100">
                  <QrCode className="size-8 text-neutral-400" />
                </div>
              )}

              {/* Status Overlay on Expiry/Scanned */}
              {status === "consumed" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 p-4 text-center backdrop-blur-xs">
                  <CheckCircle2 className="size-10 text-emerald-600 animate-bounce" />
                  <p className="mt-2 text-sm font-bold text-ink">QR Code Scanned!</p>
                  <p className="text-xs text-neutral-500">Trainer is now logged in on their phone.</p>
                </div>
              )}

              {status === "expired" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 p-4 text-center backdrop-blur-xs">
                  <Clock className="size-9 text-red-500" />
                  <p className="mt-2 text-sm font-bold text-ink">QR Code Expired</p>
                  <p className="text-xs text-neutral-500">90-second limit reached.</p>
                  <Button size="sm" onClick={() => void handleGenerateQr()} className="mt-2.5">
                    <RefreshCw className="mr-1 size-3" />
                    Regenerate
                  </Button>
                </div>
              )}

              {status === "revoked" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center rounded-2xl bg-white/95 p-4 text-center backdrop-blur-xs">
                  <XCircle className="size-9 text-amber-500" />
                  <p className="mt-2 text-sm font-bold text-ink">QR Revoked</p>
                  <Button size="sm" onClick={() => void handleGenerateQr()} className="mt-2.5">
                    Generate New QR
                  </Button>
                </div>
              )}
            </div>

            {/* QR Metadata & Instructions */}
            <div className="flex-1 space-y-3 text-left">
              <div className="space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-teal-800">
                  Trainer Identification
                </span>
                <p className="text-base font-bold text-ink">{trainerName}</p>
                <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-600">
                  <span className="rounded bg-neutral-100 px-1.5 py-0.5 font-medium font-mono text-neutral-700">
                    ID: {trainerCode || "—"}
                  </span>
                  <span>&middot;</span>
                  <span>Gym: {challenge?.organizationName || "FitForge"}</span>
                </div>
              </div>

              {/* Expiry Countdown Bar */}
              {status === "active" && (
                <div className="space-y-1 rounded-lg border border-teal-200/80 bg-white p-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1 font-medium text-neutral-700">
                      <Clock className="size-3.5 text-teal-600" />
                      Expires in:
                    </span>
                    <span className="font-bold text-teal-800 font-mono">{remainingSeconds}s</span>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-neutral-100">
                    <div
                      className={`h-full transition-all duration-1000 ${
                        remainingSeconds < 20
                          ? "bg-red-500"
                          : remainingSeconds < 45
                            ? "bg-amber-500"
                            : "bg-teal-600"
                      }`}
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>
                </div>
              )}

              {/* Instructions */}
              <div className="rounded-lg bg-teal-50/70 p-3 text-xs text-teal-900 space-y-1">
                <p className="font-semibold">How trainer signs in:</p>
                <ol className="list-decimal list-inside space-y-0.5 text-neutral-600">
                  <li>Point native phone camera at this QR code.</li>
                  <li>Tap the yellow notification link to open FitForge.</li>
                  <li>Trainer session is created instantly &mdash; no password needed.</li>
                </ol>
              </div>

              {/* Controls */}
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => void handleGenerateQr()}
                  isLoading={loading}
                  variant="outline"
                  className="bg-white hover:bg-neutral-50"
                >
                  <RefreshCw className="mr-1.5 size-3.5 text-teal-700" />
                  Regenerate QR
                </Button>

                {status === "active" && (
                  <Button
                    size="sm"
                    onClick={() => void handleRevokeQr()}
                    isLoading={revoking}
                    variant="outline"
                    className="border-amber-200 text-amber-700 hover:bg-amber-50"
                  >
                    <XCircle className="mr-1.5 size-3.5" />
                    Revoke QR
                  </Button>
                )}

                <Button
                  size="sm"
                  onClick={() => void handleRevokeDeviceSessions()}
                  isLoading={revokingDevices}
                  variant="ghost"
                  className="text-neutral-600 hover:text-red-700 hover:bg-red-50 text-xs"
                >
                  <LogOut className="mr-1.5 size-3.5" />
                  Revoke Device Sessions
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
