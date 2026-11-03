import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

function read(relative: string): string {
  return readFileSync(join(process.cwd(), relative), "utf8");
}

const portalForm = read("src/components/auth/portal-login-form.tsx");
const ownerForgotPage = read("src/app/(auth)/owner/forgot-password/page.tsx");
const ownerResetPage = read("src/app/(auth)/owner/reset-password/page.tsx");
const ownerForgotRoute = read("src/app/api/auth/owner-forgot-password/route.ts");
const ownerResetRoute = read("src/app/api/auth/owner-reset-password/route.ts");
const legacyForgotRoute = read("src/app/api/auth/forgot-password/route.ts");
const callback = read("src/app/auth/callback/route.ts");
const middleware = read("src/middleware.ts");
const recovery = read("src/lib/auth/recovery.ts");
const session = read("src/lib/auth/session.ts");
const trainerLogin = read("src/app/(auth)/trainer/login/page.tsx");
const memberLogin = read("src/app/(auth)/member/login/page.tsx");
const ownerLogin = read("src/app/(auth)/owner/login/page.tsx");
const signupPage = read("src/app/(auth)/signup/page.tsx");
const signupSession = session;
const enrollRoute = read("src/app/api/auth/owner-recovery-email/route.ts");
const profileForm = read("src/components/settings/profile-form.tsx");
const provisionLogin = read("src/app/api/org/provision-login/route.ts");

describe("owner login forgot password entry", () => {
  it("shows Forgot Password on owner login only", () => {
    expect(portalForm).toMatch(/Forgot Password\?/);
    expect(portalForm).toMatch(/href="\/owner\/forgot-password"/);
    expect(portalForm).toMatch(/portal === "owner"/);
    expect(ownerLogin).toMatch(/PortalLoginForm portal="owner"/);
    expect(trainerLogin).not.toMatch(/forgot-password/);
    expect(memberLogin).not.toMatch(/forgot-password/);
  });
});

describe("owner forgot password request", () => {
  it("collects Owner ID and sends a recovery link through the owner API", () => {
    expect(ownerForgotPage).toMatch(/Owner Username \/ Owner ID/);
    expect(ownerForgotPage).toMatch(/Send Password Recovery Link/);
    expect(ownerForgotPage).toMatch(/sendOwnerPasswordReset/);
    expect(session).toMatch(/fetch\("\/api\/auth\/owner-forgot-password"/);
    expect(ownerForgotRoute).toMatch(/resolveOwnerRecoveryTarget/);
    expect(ownerForgotRoute).toMatch(/resetPasswordForEmail\(target\.email/);
    expect(ownerForgotRoute).toMatch(/ownerRecoveryRedirectTo/);
    expect(ownerForgotRoute).toMatch(/consumeOwnerRecoveryRateLimit/);
  });

  it("returns the same public payload for known and unknown owners", () => {
    expect(ownerForgotRoute).toMatch(/return ok\(\)/);
    expect(ownerForgotRoute).toMatch(/OWNER_RECOVERY_GENERIC_MESSAGE/);
    expect(ownerForgotRoute).not.toMatch(/userId/);
    expect(ownerForgotRoute).not.toMatch(/organization_id/);
    expect(ownerForgotPage).toMatch(/OWNER_RECOVERY_GENERIC_MESSAGE/);
  });

  it("never mails the synthetic Auth email", () => {
    expect(recovery).toMatch(/isVerifiedRecoveryEmail/);
    expect(recovery).toMatch(/isUsableRecoveryEmail/);
    expect(recovery).toMatch(/role\?\.slug !== "owner"/);
    expect(recovery).toMatch(/status: "not_enrolled"/);
    expect(legacyForgotRoute).toMatch(/isInternalAuthEmail\(email\)/);
    expect(ownerForgotRoute).toMatch(/target\.status !== "ready"/);
    expect(ownerForgotRoute).not.toMatch(/users\.bsbfitforge\.local/);
    expect(ownerForgotRoute).not.toMatch(/SUPABASE_SERVICE_ROLE_KEY/);
  });
});

describe("new owner signup recovery email", () => {
  it("signs up with the real recovery email as Auth email", () => {
    expect(signupPage).toMatch(/Recovery email/);
    expect(signupPage).toMatch(/Used only to recover a forgotten password/);
    expect(signupSession).toMatch(/email: recoveryEmail/);
    expect(signupSession).not.toMatch(/toInternalAuthEmail\(username\)/);
    expect(signupSession).toMatch(/needsEmailConfirmation: !data\.session/);
    expect(provisionLogin).toMatch(/toInternalAuthEmail\(username\)/);
  });
});

describe("logged-in owner recovery enrollment", () => {
  it("lets signed-in owners verify a recovery email without replacing the account", () => {
    expect(profileForm).toMatch(/Password recovery email/);
    expect(profileForm).toMatch(/requestOwnerRecoveryEmailChange/);
    expect(profileForm).toMatch(/RECOVERY NOT ENROLLED|Recovery is not enrolled/);
    expect(enrollRoute).toMatch(/role\?\.slug !== "owner"/);
    expect(enrollRoute).toMatch(/supabase\.auth\.updateUser\(/);
    expect(enrollRoute).toMatch(/email: nextEmail/);
    expect(enrollRoute).not.toMatch(/email_confirm:\s*true/);
    expect(enrollRoute).not.toMatch(/updateUserById/);
    expect(enrollRoute).not.toMatch(/createUser/);
    expect(callback).toMatch(/safeNext === "\/settings\/profile"/);
    expect(recovery).toMatch(/RECOVERY NOT ENROLLED/);
  });
});

describe("owner reset password", () => {
  it("asks only for New Password and Confirm New Password", () => {
    expect(ownerResetPage).toMatch(/New Password/);
    expect(ownerResetPage).toMatch(/Confirm New Password/);
    expect(ownerResetPage).toMatch(/completeOwnerPasswordReset/);
    expect(ownerResetPage).not.toMatch(/Current Password/);
    expect(ownerResetPage).not.toMatch(/current-password/);
    expect(ownerResetPage).toMatch(/autoComplete="new-password"/);
    expect(ownerResetRoute).toMatch(/supabase\.auth\.updateUser\(\{ password: parsed\.data\.password \}\)/);
    expect(ownerResetRoute).toMatch(/role\?\.slug !== "owner"/);
    expect(ownerResetRoute).toMatch(/This reset link is invalid or has expired/);
    expect(ownerResetRoute).toMatch(/signOut/);
    expect(ownerResetRoute).not.toMatch(/currentPassword/);
    expect(ownerResetRoute).not.toMatch(/admin\.auth\.admin\.updateUserById/);
  });

  it("keeps recovery routes public and callback-safe", () => {
    expect(middleware).toMatch(/\/owner\/forgot-password/);
    expect(middleware).toMatch(/\/owner\/reset-password/);
    expect(callback).toMatch(/safeNext === "\/owner\/reset-password"/);
    expect(callback).toMatch(/\/owner\/forgot-password/);
  });
});
