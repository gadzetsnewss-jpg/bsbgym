"use client";

/**
 * RouteGate (Phase 1.2) - per-section permission gate for UI visibility.
 *
 * Renders its children only when the current member holds the required
 * permission (or any of `any`); otherwise renders the professional Access
 * Denied state. UI-only: the database (RLS) and the server layout's route
 * check remain the enforcement boundary. In preview mode (no Supabase) the
 * children always render so the Phase 0 shell stays explorable.
 */

import type { ReactNode } from "react";
import { useOrganization } from "@/components/auth/org-provider";
import { AccessDenied } from "@/components/auth/access-denied";

export interface RouteGateProps {
  /** Single permission required to render the children. */
  permission?: string;
  /** Rendered when at least one of these permissions is held. */
  any?: readonly string[];
  /** Force rendering (used to wrap public-ish sections explicitly). */
  allow?: boolean;
  children: ReactNode;
}

export function RouteGate({
  permission,
  any,
  allow,
  children,
}: RouteGateProps) {
  const { can, canAny, context } = useOrganization();

  // Preview mode: keep the shell fully explorable.
  if (context === null) return <>{children}</>;

  const allowed =
    typeof allow === "boolean"
      ? allow
      : permission
        ? can(permission)
        : canAny(any ?? []);

  if (!allowed) return <AccessDenied />;
  return <>{children}</>;
}
