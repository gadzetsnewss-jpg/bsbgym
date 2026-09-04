"use client";

/**
 * Professional "Access Denied" state (Phase 1.2). Rendered by RouteGate and the
 * standalone /access-denied page when an authenticated member opens a route or
 * section their role does not authorize. Uses the spec's public message and
 * never reveals internal details.
 */

import { ShieldAlert } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

export function AccessDenied() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center p-4">
      <Card className="max-w-md text-center">
        <div className="mx-auto flex size-14 items-center justify-center rounded-full bg-amber-50">
          <ShieldAlert
            aria-hidden="true"
            className="size-7 text-amber-500"
          />
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-tight text-ink">
          Access denied
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-neutral-500">
          You don&apos;t have permission to access this area. If you believe this
          is a mistake, contact your organization administrator.
        </p>
        <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
          <ButtonLink href="/dashboard" variant="primary">
            Back to Dashboard
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
