import { NextResponse } from "next/server";
import { createTrainerQrChallenge } from "@/lib/auth/trainer-qr";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const trainerId = String(body.trainerId || "").trim();

    if (!trainerId) {
      return NextResponse.json({ error: "Trainer ID is required." }, { status: 400 });
    }

    const origin =
      request.headers.get("origin") ||
      request.headers.get("x-forwarded-host") ||
      "http://localhost:3000";

    const normalizedOrigin = origin.startsWith("http") ? origin : `https://${origin}`;

    const result = await createTrainerQrChallenge(trainerId, normalizedOrigin);

    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json(result.data);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "An unexpected error occurred.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
