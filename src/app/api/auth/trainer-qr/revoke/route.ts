import { NextResponse } from "next/server";
import { revokeTrainerQrChallenge, revokeTrainerDeviceSessions } from "@/lib/auth/trainer-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trainerId = String(body.trainerId || "").trim();
    const revokeAllDevices = Boolean(body.revokeAllDevices);

    if (!trainerId) {
      return NextResponse.json({ error: "Trainer ID is required." }, { status: 400 });
    }

    if (revokeAllDevices) {
      const result = await revokeTrainerDeviceSessions(trainerId);
      if (result.error) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
      return NextResponse.json({ ok: true, message: "Device sessions revoked." });
    }

    const result = await revokeTrainerQrChallenge(trainerId);
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({ ok: true, message: "QR challenge revoked." });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
