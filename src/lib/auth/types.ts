/**
 * Shared types for authentication, organization and branch context (Phase 3).
 * These are the serializable shapes passed from the server layout to the
 * client-side providers, and consumed by hooks throughout the app.
 */

export interface AppProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  avatarUrl: string | null;
  preferences: Record<string, unknown>;
}

export interface AppOrganization {
  id: string;
  name: string;
  legalName: string | null;
  businessType: string | null;
  email: string | null;
  phone: string | null;
  website: string | null;
  addressLine1: string | null;
  addressLine2: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  country: string | null;
  taxId: string | null;
  currency: string;
  timezone: string;
  dateFormat: string;
  logoUrl: string | null;
  status: string;
}

export interface AppMember {
  id: string;
  userId: string;
  roleId: string;
  roleName: string;
  roleSlug: string;
  status: string;
  accessAllBranches: boolean;
}

export interface AppBranch {
  id: string;
  name: string;
  code: string;
  city: string | null;
  timezone: string;
  status: string;
}

/** Full authenticated app context (one organization + one membership). */
export interface AppContextData {
  profile: AppProfile;
  organization: AppOrganization;
  member: AppMember;
  /** Permission strings for the member's role. */
  permissions: string[];
  /** Branches the member is authorized to operate in. */
  branches: AppBranch[];
  /** Currently selected branch (persisted in the browser). */
  currentBranchId: string | null;
}

export interface AuthPageSearchParams {
  /** e.g. `?verified=email` after clicking the confirmation link. */
  verified?: string;
  /** e.g. `?invite=<token>` to pre-fill the accept flow. */
  invite?: string;
  /** e.g. `?next=/dashboard` for post-login redirects. */
  next?: string;
  /** `?code=...` for code exchange flows (reset password). */
  code?: string;
}
