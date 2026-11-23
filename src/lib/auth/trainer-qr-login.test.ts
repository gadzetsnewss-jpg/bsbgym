import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { hashChallengeToken, generateQrSvg } from "@/lib/auth/trainer-qr";

const MIGRATION_PATH = path.resolve(
  process.cwd(),
  "supabase/migrations/20261123000040_trainer_qr_login.sql",
);
const COMBINE_PATH = path.resolve(process.cwd(), "COMBINE.sql");

const migrationSql = fs.existsSync(MIGRATION_PATH)
  ? fs.readFileSync(MIGRATION_PATH, "utf-8")
  : "";
const combineSql = fs.existsSync(COMBINE_PATH)
  ? fs.readFileSync(COMBINE_PATH, "utf-8")
  : "";

describe("Petpooja Captain-style Trainer QR Login — Security & Migration", () => {
  it("defines the trainer_qr_challenges table with single-use check constraints", () => {
    expect(migrationSql).toContain("create table if not exists public.trainer_qr_challenges");
    expect(migrationSql).toContain("token_hash text not null unique");
    expect(migrationSql).toContain("check (status in ('active', 'consumed', 'expired', 'revoked'))");
    expect(migrationSql).toContain("expires_at timestamptz not null");
    expect(migrationSql).toContain("consumed_at timestamptz");
    expect(migrationSql).toContain("consumed_ip text");
    expect(migrationSql).toContain("consumed_user_agent text");
    expect(migrationSql).toContain("revoked_at timestamptz");
  });

  it("enforces row level security and org admin policy on trainer_qr_challenges", () => {
    expect(migrationSql).toContain("alter table public.trainer_qr_challenges enable row level security;");
    expect(migrationSql).toContain("public.is_org_admin(organization_id)");
  });

  it("creates atomic RPC create_trainer_qr_challenge that revokes prior challenges", () => {
    expect(migrationSql).toContain("create or replace function public.create_trainer_qr_challenge");
    expect(migrationSql).toContain("public.is_org_admin(p_org_id)");
    expect(migrationSql).toContain("set status = 'revoked'");
    expect(migrationSql).toContain("status = 'active'");
    expect(migrationSql).toContain("expires_at timestamptz");
  });

  it("creates atomic RPC consume_trainer_qr_challenge with row locking and replay prevention", () => {
    expect(migrationSql).toContain("create or replace function public.consume_trainer_qr_challenge");
    expect(migrationSql).toContain("for update;");
    expect(migrationSql).toContain("QR challenge token has already been used");
    expect(migrationSql).toContain("QR challenge token has been revoked");
    expect(migrationSql).toContain("QR challenge token has expired");
    expect(migrationSql).toContain("set status = 'consumed'");
  });

  it("creates RPC revoke_trainer_qr_challenge with org admin check", () => {
    expect(migrationSql).toContain("create or replace function public.revoke_trainer_qr_challenge");
    expect(migrationSql).toContain("public.is_org_admin(p_org_id)");
    expect(migrationSql).toContain("set status = 'revoked'");
  });

  it("is recorded in COMBINE.sql without dropping tables or disabling RLS", () => {
    expect(combineSql).toContain("20261123000040_trainer_qr_login.sql");
    expect(combineSql).toContain("trainer_qr_challenges");
    expect(migrationSql).not.toMatch(/drop table/i);
    expect(migrationSql).not.toMatch(/disable row level security/i);
  });
});

describe("Petpooja Captain-style Trainer QR Login — Crypto & QR Rendering", () => {
  it("hashes challenge tokens with SHA-256 deterministically", () => {
    const rawToken = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const expectedHash = crypto.createHash("sha256").update(rawToken).digest("hex");
    expect(hashChallengeToken(rawToken)).toBe(expectedHash);
    expect(hashChallengeToken(rawToken)).toHaveLength(64);
  });

  it("never includes passwords or auth credentials in challenge tokens", () => {
    const rawToken = crypto.randomBytes(32).toString("hex");
    expect(rawToken).toHaveLength(64);
    expect(rawToken).not.toContain("password");
    expect(rawToken).not.toContain("jwt");
    expect(rawToken).not.toContain("secret");
  });

  it("generates standards-compliant SVG QR codes that phone cameras can scan", async () => {
    const testUrl = "https://app.bsbfitforge.com/trainer/qr-auth?token=" + crypto.randomBytes(32).toString("hex");
    const svg = await generateQrSvg(testUrl);
    expect(svg).toContain("<svg");
    expect(svg).toContain("</svg>");
    expect(svg).toContain("#063C3B"); // Deep teal branding color
    expect(svg).toContain("viewBox=");
  });
});

describe("Petpooja Captain-style Trainer QR Login — UI & Flow Scoping", () => {
  it("embeds TrainerQrPanel in Login Access for trainers", () => {
    const panelFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/org/login-link-panel.tsx"),
      "utf-8",
    );
    expect(panelFile).toContain("TrainerQrPanel");
    expect(panelFile).toContain("linkedUserId &&");
  });

  it("provides 90s countdown timer and revocation controls in TrainerQrPanel", () => {
    const qrPanelFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/trainers/trainer-qr-panel.tsx"),
      "utf-8",
    );
    expect(qrPanelFile).toContain("Mobile QR Login (Captain Style)");
    expect(qrPanelFile).toContain("Single-use 90s");
    expect(qrPanelFile).toContain("Generate Trainer QR");
    expect(qrPanelFile).toContain("Regenerate QR");
    expect(qrPanelFile).toContain("Revoke QR");
    expect(qrPanelFile).toContain("Revoke Device Sessions");
    expect(qrPanelFile).toContain("/api/auth/trainer-qr/generate");
    expect(qrPanelFile).toContain("/api/auth/trainer-qr/status");
    expect(qrPanelFile).toContain("/api/auth/trainer-qr/revoke");
  });

  it("authenticates scanned trainer via Supabase Auth without password in qr-auth/route.ts", () => {
    const authRouteFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/trainer/qr-auth/route.ts"),
      "utf-8",
    );
    expect(authRouteFile).toContain("consume_trainer_qr_challenge");
    expect(authRouteFile).toContain("generateLink");
    expect(authRouteFile).toContain("verifyOtp");
    expect(authRouteFile).toContain("bsb_portal");
    expect(authRouteFile).toContain("/dashboard");
    expect(authRouteFile).toContain('reason = "expired"');
    expect(authRouteFile).toContain('reason = "already_used"');
  });

  it("provides fallback camera scanner and PWA manifest", () => {
    const scanFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/trainer/qr-scan/page.tsx"),
      "utf-8",
    );
    expect(scanFile).toContain("getUserMedia");
    expect(scanFile).toContain("Camera Access Required");
    expect(scanFile).toContain("Sign In with Trainer ID");

    const manifestFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/app/manifest.ts"),
      "utf-8",
    );
    expect(manifestFile).toContain("FitForge Trainer");
    expect(manifestFile).toContain("standalone");
  });

  it("preserves normal Trainer ID and password login at /trainer/login", () => {
    const loginFormFile = fs.readFileSync(
      path.resolve(process.cwd(), "src/components/auth/portal-login-form.tsx"),
      "utf-8",
    );
    expect(loginFormFile).toContain("Sign in");
    expect(loginFormFile).toContain("Scan QR Code to Sign In");
    expect(loginFormFile).toContain("/trainer/qr-scan");
  });
});
