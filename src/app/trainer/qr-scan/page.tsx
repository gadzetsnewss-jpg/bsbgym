"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  ChevronLeft,
  KeyRound,
  QrCode,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";

export default function TrainerQrScanPage() {
  const router = useRouter();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const canvasRef = React.useRef<HTMLCanvasElement>(null);

  const [permissionState, setPermissionState] = React.useState<
    "idle" | "requesting" | "granted" | "denied" | "unsupported"
  >("idle");
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);

  const startCamera = React.useCallback(async () => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setPermissionState("unsupported");
      setErrorMsg("Camera access is not supported on this device/browser.");
      return;
    }

    try {
      setPermissionState("requesting");
      setErrorMsg(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setPermissionState("granted");
        setScanning(true);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/notallowed|permission denied/i.test(msg)) {
        setPermissionState("denied");
        setErrorMsg("Camera access was denied. Please allow camera permissions in your browser.");
      } else {
        setPermissionState("denied");
        setErrorMsg("Could not start camera. You can also upload a photo of the QR code below.");
      }
    }
  }, []);

  React.useEffect(() => {
    void startCamera();

    return () => {
      // Cleanup video stream on unmount
      if (videoRef.current && videoRef.current.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [startCamera]);

  // Frame detection loop using BarcodeDetector if available
  React.useEffect(() => {
    if (!scanning || permissionState !== "granted") return;

    let active = true;
    let detector: { detect: (source: ImageBitmapSource) => Promise<{ rawValue: string }[]> } | null = null;

    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => typeof detector }).BarcodeDetector;
        detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
      } catch {
        detector = null;
      }
    }

    const checkFrame = async () => {
      if (!active || !videoRef.current || videoRef.current.readyState < 2) {
        if (active) requestAnimationFrame(checkFrame);
        return;
      }

      if (detector) {
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes && codes.length > 0 && codes[0].rawValue) {
            const raw = codes[0].rawValue.trim();
            if (raw.includes("/trainer/qr-auth?token=") || raw.startsWith("http")) {
              active = false;
              setScanning(false);
              window.location.href = raw;
              return;
            }
          }
        } catch {
          // Keep loop going
        }
      }

      if (active) {
        requestAnimationFrame(checkFrame);
      }
    };

    const animId = requestAnimationFrame(checkFrame);
    return () => {
      active = false;
      cancelAnimationFrame(animId);
    };
  }, [scanning, permissionState]);

  // Manual fallback via photo capture
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const BarcodeDetectorClass = (window as unknown as { BarcodeDetector: new (opts: { formats: string[] }) => { detect: (s: ImageBitmapSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
        const detector = new BarcodeDetectorClass({ formats: ["qr_code"] });
        const img = await createImageBitmap(file);
        const codes = await detector.detect(img);
        if (codes && codes.length > 0 && codes[0].rawValue) {
          window.location.href = codes[0].rawValue.trim();
          return;
        }
      } catch {
        // Fall through
      }
    }

    setErrorMsg("Could not detect a valid QR code in this image. Please try again or sign in with password.");
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-950 px-4 py-8 text-white">
      <div className="w-full max-w-sm space-y-4">
        {/* Top Header */}
        <div className="flex items-center justify-between">
          <Link
            href="/trainer/login"
            className="inline-flex items-center text-xs font-medium text-neutral-400 hover:text-white"
          >
            <ChevronLeft className="mr-1 size-4" />
            Trainer Login
          </Link>
          <span className="rounded-full bg-teal-500/20 px-2.5 py-0.5 text-[11px] font-semibold text-teal-300">
            Captain QR Scanner
          </span>
        </div>

        {/* Camera Viewport Card */}
        <Card className="relative overflow-hidden rounded-2xl border border-white/10 bg-neutral-900 p-0 shadow-2xl">
          <div className="relative aspect-square w-full overflow-hidden bg-black flex items-center justify-center">
            <video
              ref={videoRef}
              playsInline
              muted
              className="size-full object-cover"
              aria-label="Camera scanner viewfinder"
            />
            <canvas ref={canvasRef} className="hidden" />

            {/* Scanning Guide Overlay */}
            {permissionState === "granted" && (
              <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                <div className="relative size-60 rounded-2xl border-2 border-teal-400/80 bg-teal-500/5 shadow-[0_0_0_9999px_rgba(0,0,0,0.6)]">
                  {/* Corner accents */}
                  <span className="absolute -left-1 -top-1 size-5 rounded-tl border-l-4 border-t-4 border-teal-400" />
                  <span className="absolute -right-1 -top-1 size-5 rounded-tr border-r-4 border-t-4 border-teal-400" />
                  <span className="absolute -bottom-1 -left-1 size-5 rounded-bl border-b-4 border-l-4 border-teal-400" />
                  <span className="absolute -bottom-1 -right-1 size-5 rounded-br border-b-4 border-r-4 border-teal-400" />

                  {/* Animated scanning bar */}
                  <div className="absolute left-0 right-0 h-0.5 bg-gradient-to-r from-transparent via-teal-400 to-transparent animate-bounce opacity-80" />
                </div>
              </div>
            )}

            {/* Permission Denied / Error State */}
            {permissionState === "denied" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-950/90 space-y-3">
                <div className="flex size-12 items-center justify-center rounded-full bg-red-500/20 text-red-400">
                  <AlertCircle className="size-6" />
                </div>
                <p className="text-sm font-semibold text-white">Camera Access Required</p>
                <p className="text-xs text-neutral-400 leading-relaxed">
                  {errorMsg || "Please allow camera access in your browser to scan the QR code."}
                </p>
                <Button size="sm" onClick={() => void startCamera()} variant="outline" className="border-white/20 text-white">
                  <RefreshCw className="mr-1.5 size-3.5" />
                  Try Again
                </Button>
              </div>
            )}

            {/* Requesting state */}
            {permissionState === "requesting" && (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center bg-neutral-950/80 space-y-2">
                <Camera className="size-8 text-teal-400 animate-pulse" />
                <p className="text-xs text-neutral-300">Starting camera…</p>
              </div>
            )}
          </div>

          <div className="p-4 space-y-3 text-center">
            <p className="text-xs text-neutral-300">
              Align the QR code from the Owner screen within the frame to sign in instantly.
            </p>

            {/* Fallback Photo Capture */}
            <div className="pt-1">
              <label className="inline-flex cursor-pointer items-center justify-center rounded-lg border border-white/20 bg-white/5 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/10 w-full">
                <Camera className="mr-1.5 size-3.5 text-teal-300" />
                Upload / Take Photo of QR
                <input
                  type="file"
                  accept="image/*"
                  capture="environment"
                  className="sr-only"
                  onChange={handleFileUpload}
                />
              </label>
            </div>
          </div>
        </Card>

        {/* Fallback to Trainer Login */}
        <div className="pt-2">
          <ButtonLink
            href="/trainer/login"
            variant="outline"
            size="md"
            className="w-full justify-center border-white/20 bg-neutral-900 text-white hover:bg-neutral-800"
          >
            <KeyRound className="mr-1.5 size-4" />
            Sign In with Trainer ID &amp; Password
          </ButtonLink>
        </div>
      </div>
    </div>
  );
}
