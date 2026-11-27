import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import {
  initialMemberTemporaryPassword,
  normalizeContactNumber,
  normalizeGymCode,
} from "@/lib/auth/username";
import {
  MEMBER_NAV_ITEMS,
  MEMBER_NAV_SECTION,
  FLAT_NAV_ITEMS,
} from "@/config/navigation";

const ROOT = process.cwd();

function readSource(relativePath: string): string {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

describe("Member Temporary Password Formula", () => {
  it("generates predictable temporary password from last 4 mobile digits and birth year", () => {
    // Standard 10-digit mobile + YYYY-MM-DD
    const password = initialMemberTemporaryPassword("9876545072", "1998-05-12");
    expect(password).toBe("50721998");
  });

  it("handles mobile with +91 country prefix and 12-digit format", () => {
    const password = initialMemberTemporaryPassword("+919876545072", "1995-11-20");
    expect(password).toBe("50721995");

    const password12 = initialMemberTemporaryPassword("919876545072", "2001-01-01");
    expect(password12).toBe("50722001");
  });

  it("handles Date objects for date_of_birth", () => {
    const dob = new Date(Date.UTC(1990, 6, 15));
    const password = initialMemberTemporaryPassword("9988771234", dob);
    expect(password).toBe("12341990");
  });

  it("returns null if phone is missing, invalid or too short", () => {
    expect(initialMemberTemporaryPassword("", "1998-05-12")).toBeNull();
    expect(initialMemberTemporaryPassword(null, "1998-05-12")).toBeNull();
    expect(initialMemberTemporaryPassword("12345", "1998-05-12")).toBeNull();
  });

  it("returns null if date_of_birth is missing or has invalid year", () => {
    expect(initialMemberTemporaryPassword("9876545072", "")).toBeNull();
    expect(initialMemberTemporaryPassword("9876545072", null)).toBeNull();
    expect(initialMemberTemporaryPassword("9876545072", "not-a-date")).toBeNull();
    expect(initialMemberTemporaryPassword("9876545072", "1850-01-01")).toBeNull(); // < 1900
    expect(initialMemberTemporaryPassword("9876545072", "2200-01-01")).toBeNull(); // > 2100
  });
});

describe("Approved Member Navigation (Strict 10 Items)", () => {
  const expectedItems = [
    { title: "Dashboard", href: "/dashboard" },
    { title: "My Membership", href: "/memberships/active" },
    { title: "My Workouts", href: "/fitness/workout-plans" },
    { title: "My Diet Plan", href: "/fitness/diet-plans" },
    { title: "My Trainer", href: "/trainers" },
    { title: "Attendance", href: "/attendance" },
    { title: "PT Sessions", href: "/trainers/pt-sessions" },
    { title: "Progress & Measurements", href: "/fitness/progress" },
    { title: "Notifications", href: "/notifications" },
    { title: "My Profile", href: "/settings/profile" },
  ];

  it("contains exactly 10 navigation items in approved strict order", () => {
    expect(MEMBER_NAV_ITEMS).toHaveLength(10);
    expectedItems.forEach((expected, index) => {
      expect(MEMBER_NAV_ITEMS[index].title).toBe(expected.title);
      expect(MEMBER_NAV_ITEMS[index].href).toBe(expected.href);
      expect(MEMBER_NAV_ITEMS[index].icon).toBeDefined();
      expect(MEMBER_NAV_ITEMS[index].description).toBeDefined();
    });
  });

  it("exports MEMBER_NAV_SECTION with member_portal id", () => {
    expect(MEMBER_NAV_SECTION.id).toBe("member_portal");
    expect(MEMBER_NAV_SECTION.title).toBe("Member Portal");
    expect(MEMBER_NAV_SECTION.items).toEqual(MEMBER_NAV_ITEMS);
  });

  it("indexes all 10 member items in FLAT_NAV_ITEMS", () => {
    expectedItems.forEach((expected) => {
      const match = FLAT_NAV_ITEMS.find(
        (item) => item.href === expected.href && item.sectionTitle === "Member Portal",
      );
      expect(match).toBeDefined();
      expect(match?.title).toBe(expected.title);
    });
  });
});

describe("Member Portal Shell & Sidebar", () => {
  it("sidebar detects member role and renders Member Portal navigation and access badge", () => {
    const sidebar = readSource("src/components/layout/sidebar.tsx");
    expect(sidebar).toMatch(/hasRole\(\["member"\]\)/);
    expect(sidebar).toMatch(/cookiePortal === "member"/);
    expect(sidebar).toMatch(/MEMBER_NAV_SECTION/);
    expect(sidebar).toMatch(/Member Portal ·/);
    expect(sidebar).toMatch(/Role: Member/);
    expect(sidebar).toMatch(/Member Access/);
    expect(sidebar).toMatch(/Workouts, Diet & Attendance/);
  });

  it("dashboard-home routes members directly to MemberHome without owner banner", () => {
    const dashboardHome = readSource("src/components/dashboard/dashboard-home.tsx");
    expect(dashboardHome).toMatch(/hasRole\(\["member"\]\) \|\| cookiePortal === "member"/);
    expect(dashboardHome).toMatch(/return <MemberHome \/>;/);
  });

  it("quick-action-menu includes member quick actions for digital pass, workouts, diet, PT", () => {
    const quickActions = readSource("src/components/layout/quick-action-menu.tsx");
    expect(quickActions).toMatch(/MEMBER_QUICK_ACTIONS/);
    expect(quickActions).toMatch(/Digital Pass & QR/);
    expect(quickActions).toMatch(/\/fitness\/workout-plans/);
    expect(quickActions).toMatch(/\/fitness\/diet-plans/);
  });
});

describe("Member Login Form & Sign-In Route", () => {
  it("configures Member sign-in with Registered Mobile Number as login ID", () => {
    const loginForm = readSource("src/components/auth/portal-login-form.tsx");
    expect(loginForm).toMatch(/idLabel:\s*"Registered Mobile Number"/);
    expect(loginForm).toMatch(/idPlaceholder:\s*"e\.g\. 9876543210"/);
    expect(loginForm).toMatch(/credentialLabel:\s*"Password"/);
    expect(loginForm).toMatch(/last 4 digits of phone \+ birth year/);
  });

  it("sign-in route calls auth_email_for_gym_member_phone and sets bsb_portal cookie", () => {
    const signInRoute = readSource("src/app/api/auth/sign-in/route.ts");
    expect(signInRoute).toMatch(/auth_email_for_gym_member_phone/);
    expect(signInRoute).toMatch(/p_gym_code:\s*gymCode/);
    expect(signInRoute).toMatch(/p_phone:\s*identifier/);
    expect(signInRoute).toMatch(/bsb_portal/);
    expect(signInRoute).toMatch(/return NextResponse\.json\(\{ ok: true \}\)/);
  });
});

describe("Owner-Side Member Login Access Panel", () => {
  it("renders MemberLoginPanel in MemberLoginLinkPanel with phone and DOB support", () => {
    const loginLinkPanel = readSource("src/components/org/login-link-panel.tsx");
    expect(loginLinkPanel).toMatch(/MemberLoginPanel/);
    expect(loginLinkPanel).toMatch(/phone/);
    expect(loginLinkPanel).toMatch(/dateOfBirth/);
  });

  it("member-detail mounts MemberLoginLinkPanel with full member credentials", () => {
    const memberDetail = readSource("src/components/members/member-detail.tsx");
    expect(memberDetail).toMatch(/<MemberLoginLinkPanel/);
    expect(memberDetail).toMatch(/memberCode=\{member\.code\}/);
    expect(memberDetail).toMatch(/phone=\{member\.phone\}/);
    expect(memberDetail).toMatch(/dateOfBirth=\{member\.dateOfBirth\}/);
  });

  it("MemberLoginPanel enforces validation, temporary password generation, and handover display", () => {
    const memberLoginPanel = readSource("src/components/members/member-login-panel.tsx");
    expect(memberLoginPanel).toMatch(/Member Login Access/);
    expect(memberLoginPanel).toMatch(/Login Active/);
    expect(memberLoginPanel).toMatch(/Login Not Created/);
    expect(memberLoginPanel).toMatch(/Login ID \(Mobile\)/);
    expect(memberLoginPanel).toMatch(/Gym Code/);
    expect(memberLoginPanel).toMatch(/Member Handover Instructions/);
    expect(memberLoginPanel).toMatch(/Reset Member Password/);
    expect(memberLoginPanel).toMatch(/Create Member Login/);
  });
});

describe("Database Migration for Member Portal Auth", () => {
  it("includes 20261123000041_member_portal_auth.sql in migrations and COMBINE.sql", () => {
    const migration = readSource("supabase/migrations/20261123000041_member_portal_auth.sql");
    const combine = readSource("supabase/COMBINE.sql");

    expect(migration).toMatch(/create or replace function public\.require_password_change/);
    expect(migration).toMatch(/create or replace function public\.auth_email_for_gym_member_phone/);
    expect(migration).toMatch(/grant execute on function public\.auth_email_for_gym_member_phone\(text, text\) to service_role/);
    expect(migration).toMatch(/attendance\.view/);
    expect(migration).toMatch(/fitness\.view/);

    expect(combine).toMatch(/require_password_change/);
    expect(combine).toMatch(/auth_email_for_gym_member_phone/);
  });
});
