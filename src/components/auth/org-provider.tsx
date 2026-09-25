"use client";

/**
 * Centralized organization + branch context (Phase 3).
 *
 * Seeded once from the server layout (`(app)/layout.tsx`) so the profile,
 * organization, membership role, permissions and authorized branches are all
 * available without any per-page fetching. Branch selection is persisted in a
 * cookie and is NOT a security boundary - RLS enforces branch access.
 */

import * as React from "react";
import type { AppContextData } from "@/lib/auth/types";
import {
  hasPermission,
  hasAnyPermission,
  hasAllPermissions,
  canAccessBranch,
  isAdminRole,
  isOwnerRole,
  hasRole,
} from "@/lib/auth/permissions";

const BRANCH_COOKIE = "bsb_branch";

function readBranchCookie(): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie
    .split("; ")
    .find((row) => row.startsWith(`${BRANCH_COOKIE}=`));
  return match ? decodeURIComponent(match.split("=")[1]) : null;
}

function writeBranchCookie(branchId: string): void {
  document.cookie = `${BRANCH_COOKIE}=${encodeURIComponent(branchId)}; path=/; max-age=31536000; samesite=lax`;
}

interface OrgContextValue {
  /** Null until the server context is available (or preview mode). */
  context: AppContextData | null;
  profile: AppContextData["profile"] | null;
  organization: AppContextData["organization"] | null;
  member: AppContextData["member"] | null;
  permissions: string[];
  branches: AppContextData["branches"];
  /** Currently selected branch id (validated against `branches`). */
  currentBranchId: string | null;
  currentBranch: AppContextData["branches"][number] | null;
  /** Branch selection is a UI preference, not a security boundary. */
  setBranch: (branchId: string) => void;
  /** Permission gate helper for UI visibility. */
  can: (permission: string) => boolean;
  /** True when the caller holds at least one of the listed permissions. */
  canAny: (permissions: readonly string[]) => boolean;
  /** True when the caller holds every listed permission. */
  canAll: (permissions: readonly string[]) => boolean;
  /** True when the caller may operate in the given branch (UI mirror of RLS). */
  canAccessBranch: (branchId: string) => boolean;
  /** Current member's role slug (one of the seeded role slugs). */
  roleSlug: string | null;
  /** True when the current member's role is one of the listed slugs. */
  hasRole: (roleSlugs: readonly string[]) => boolean;
  isAdmin: boolean;
  isOwner: boolean;
  /** Updates the cached profile after an edit (e.g. profile page). */
  updateProfileLocal: (profile: AppContextData["profile"]) => void;
  /** Updates the cached organization after an edit (e.g. organization settings). */
  updateOrganizationLocal: (organization: AppContextData["organization"]) => void;
  /** Updates authorized branches after create/edit/status changes. */
  updateBranchesLocal: (branches: AppContextData["branches"]) => void;
}

const OrgContext = React.createContext<OrgContextValue | null>(null);

export function useOrganization(): OrgContextValue {
  const context = React.useContext(OrgContext);
  if (!context) {
    throw new Error("useOrganization must be used within an <OrgProvider>");
  }
  return context;
}

/* ---------------------------------------------------------------------------
   Spec-named convenience hooks (thin wrappers around useOrganization).
   --------------------------------------------------------------------------- */

/** The signed-in user's profile, or null when not authenticated. */
export function useCurrentUser(): AppContextData["profile"] | null {
  return useOrganization().profile;
}

/** The currently selected authorized branch, or null. */
export function useBranch(): AppContextData["branches"][number] | null {
  return useOrganization().currentBranch;
}

/** The current member's effective permission strings (UI gates only). */
export function usePermissions(): string[] {
  return useOrganization().permissions;
}

export interface OrgProviderProps {
  /** Server-resolved app context; null in preview mode / outside the shell. */
  initial: AppContextData | null;
  children: React.ReactNode;
}

export function OrgProvider({ initial, children }: OrgProviderProps) {
  const [context, setContext] = React.useState<AppContextData | null>(initial);
  const [currentBranchId, setCurrentBranchId] = React.useState<string | null>(
    () => {
      if (!initial) return null;
      const persisted = readBranchCookie();
      if (persisted && initial.branches.some((branch) => branch.id === persisted)) {
        return persisted;
      }
      return initial.branches[0]?.id ?? null;
    },
  );

  // Keep context in sync if the server re-renders with new data.
  React.useEffect(() => {
    setContext(initial);
  }, [initial]);

  const branches = context?.branches ?? [];

  const updateProfileLocal = React.useCallback((profile: AppContextData["profile"]) => {
    setContext((prev) => (prev ? { ...prev, profile } : prev));
  }, []);

  const updateOrganizationLocal = React.useCallback(
    (organization: AppContextData["organization"]) => {
      setContext((prev) => (prev ? { ...prev, organization } : prev));
    },
    [],
  );

  const updateBranchesLocal = React.useCallback((nextBranches: AppContextData["branches"]) => {
    setContext((prev) => (prev ? { ...prev, branches: nextBranches } : prev));
    setCurrentBranchId((current) => {
      if (current && nextBranches.some((branch) => branch.id === current)) {
        return current;
      }
      const nextId = nextBranches[0]?.id ?? null;
      if (nextId) writeBranchCookie(nextId);
      return nextId;
    });
  }, []);

  const value = React.useMemo<OrgContextValue>(() => {
    const currentBranch =
      branches.find((branch) => branch.id === currentBranchId) ?? null;
    const permissions = context?.permissions ?? [];

    return {
      context,
      profile: context?.profile ?? null,
      organization: context?.organization ?? null,
      member: context?.member ?? null,
      permissions,
      branches,
      currentBranchId,
      currentBranch,
      setBranch: (branchId) => {
        if (!branches.some((branch) => branch.id === branchId)) return;
        setCurrentBranchId(branchId);
        writeBranchCookie(branchId);
      },
      can: (permission) => hasPermission(permissions, permission),
      canAny: (required) => hasAnyPermission(permissions, required),
      canAll: (required) => hasAllPermissions(permissions, required),
      canAccessBranch: (branchId) =>
        canAccessBranch(
          {
            accessAllBranches: context?.member.accessAllBranches ?? false,
          },
          (context?.branches ?? []).map((branch) => branch.id),
          branchId,
        ),
      roleSlug: context?.member.roleSlug ?? null,
      hasRole: (roleSlugs) => hasRole(context?.member.roleSlug, roleSlugs),
      isAdmin: isAdminRole(context?.member.roleSlug),
      isOwner: isOwnerRole(context?.member.roleSlug),
      updateProfileLocal,
      updateOrganizationLocal,
      updateBranchesLocal,
    };
  }, [
    context,
    branches,
    currentBranchId,
    updateProfileLocal,
    updateOrganizationLocal,
    updateBranchesLocal,
  ]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
