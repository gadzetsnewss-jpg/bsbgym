import type { Metadata } from "next";
import Link from "next/link";
import { AlertCircle, Clock, KeyRound, QrCode, ShieldAlert } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Trainer QR Login Status",
};

interface PageProps {
  searchParams: Promise<{ status?: string }>;
}

export default async function TrainerQrResultPage({ searchParams }: PageProps) {
  const { status } = await searchParams;

  const isExpired = status === "expired";
  const isUsed = status === "already_used";
  const isRevoked = status === "revoked";

  const title = isExpired
    ? "QR Code Expired"
    : isUsed
      ? "QR Code Already Used"
      : isRevoked
        ? "QR Code Revoked"
        : "Invalid QR Code";

  const description = isExpired
    ? "For security, trainer QR codes expire after 90 seconds. Ask your gym owner to regenerate the QR code on the Owner screen."
    : isUsed
      ? "This QR login was already scanned and consumed on another device. QR codes are single-use only. Ask your gym owner for a fresh QR."
      : isRevoked
        ? "This QR login was revoked by your gym owner. Please contact your gym administrator or sign in using your Trainer ID."
        : "The scanned QR code is invalid or missing required challenge parameters.";

  const IconComponent = isExpired ? Clock : isUsed ? QrCode : ShieldAlert;

  return (
    <div className="flex min-h-screen items-center justify-center bg-neutral-50 px-4 py-8">
      <Card className="w-full max-w-md p-6 sm:p-8 text-center space-y-5 shadow-md border-neutral-200">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50 text-amber-600">
          <IconComponent className="size-8" />
        </div>

        <div>
          <h1 className="text-xl font-bold tracking-tight text-ink sm:text-2xl">{title}</h1>
          <p className="mt-2 text-sm text-neutral-600 leading-relaxed">{description}</p>
        </div>

        <div className="rounded-lg border border-neutral-200/80 bg-neutral-100/60 p-3.5 text-xs text-neutral-600 text-left space-y-1.5">
          <p className="font-semibold text-neutral-800">What to do next:</p>
          <ul className="list-disc list-inside space-y-1">
            <li>Ask your gym owner to click <strong>&quot;Regenerate QR&quot;</strong> in Owner Portal &gt; Trainers.</li>
            <li>Scan the fresh QR within 90 seconds.</li>
            <li>Or sign in directly using your Trainer ID and password below.</li>
          </ul>
        </div>

        <div className="pt-2 flex flex-col gap-2.5">
          <ButtonLink href="/trainer/login" variant="primary" size="md" className="w-full justify-center">
            <KeyRound className="mr-1.5 size-4" />
            Sign In with Trainer ID &amp; Password
          </ButtonLink>
          <ButtonLink href="/trainer/qr-scan" variant="outline" size="md" className="w-full justify-center">
            <QrCode className="mr-1.5 size-4" />
            Scan Another QR Code
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
