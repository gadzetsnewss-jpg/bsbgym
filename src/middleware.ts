import { type NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";
import { isSupabaseConfigured } from "@/lib/env";

/**
 * Protected path prefixes (must be kept in sync with the route groups).
 * `/onboarding` requires a session but not an organization.
 */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/members",
  "/memberships",
  "/billing",
  "/attendance",
  "/trainers",
  "/fitness",
  "/classes",
  "/pos",
  "/inventory",
  "/crm",
  "/finance",
  "/reports",
  "/notifications",
  "/settings",
  "/onboarding",
];

/** Public auth paths - signed-in users are redirected by the auth layout. */
const PUBLIC_PREFIXES = ["/login", "/signup", "/forgot-password", "/reset-password"];

/** Paths that must never be redirected (callbacks, asset-ish routes). */
const EXCLUDED_PREFIXES = ["/auth", "/accept-invitation", "/_next"];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const excluded = EXCLUDED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isProtected = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const isPublicAuth = PUBLIC_PREFIXES.some((prefix) => pathname === prefix);

  // Preview mode (no Supabase configured): leave everything untouched.
  if (!isSupabaseConfigured) {
    return NextResponse.next();
  }

  // Refresh the session cookie and learn the user.
  const client = await updateSession(request, NextResponse.next({ request }));
  const response = client?.response ?? NextResponse.next({ request });
  const user = client?.user ?? null;

  if (excluded) {
    return response;
  }

  if (isProtected && !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (isPublicAuth && user) {
    // Signed-in users never see login/signup screens. The auth layout decides
    // between /dashboard and /onboarding based on their membership state.
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
