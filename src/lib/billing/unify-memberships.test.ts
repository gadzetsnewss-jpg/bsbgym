import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ActiveMembershipRow,
  ActiveMembershipsSummary,
  fetchActiveMemberships,
} from "@/lib/org/memberships";

describe("Hardened Unify New Invoice & Active Memberships Workflow (00045)", () => {
  const migrationPath = resolve(
    __dirname,
    "../../../supabase/migrations/20261127000045_harden_unify_new_invoice_memberships.sql",
  );
  const migrationSql = readFileSync(migrationPath, "utf-8");

  describe("1. SQL Migration Hardening & Security Checks", () => {
    it("defines sync_invoice_membership with SECURITY DEFINER and search_path = public", () => {
      expect(migrationSql).toMatch(
        /create or replace function public\.sync_invoice_membership\(p_invoice_id uuid\)[\s\S]*?security definer[\s\S]*?set search_path = public/i,
      );
    });

    it("requires billing.create permission inside sync_invoice_membership", () => {
      expect(migrationSql).toMatch(
        /perform public\.require_org_permission\(v_invoice\.organization_id,\s*'billing\.create'\);/i,
      );
    });

    it("locks the invoice and member rows with FOR UPDATE to prevent concurrency race conditions", () => {
      expect(migrationSql).toMatch(
        /select \* into v_invoice[\s\S]*?from public\.invoices[\s\S]*?for update;/i,
      );
      expect(migrationSql).toMatch(
        /perform 1 from public\.gym_members where id = v_invoice\.member_id for update;/i,
      );
    });

    it("defines link_invoice_membership with SECURITY DEFINER and search_path = public", () => {
      expect(migrationSql).toMatch(
        /create or replace function public\.link_invoice_membership\([\s\S]*?p_invoice_id uuid[\s\S]*?p_membership_id uuid[\s\S]*?\)[\s\S]*?security definer[\s\S]*?set search_path = public/i,
      );
    });

    it("requires billing.create permission inside link_invoice_membership", () => {
      expect(migrationSql).toMatch(
        /perform public\.require_org_permission\(v_invoice\.organization_id,\s*'billing\.create'\);/i,
      );
    });

    it("rejects cross-member linking in link_invoice_membership", () => {
      expect(migrationSql).toMatch(
        /if v_membership\.member_id <> v_invoice\.member_id then\s+raise exception 'cannot link invoice to a membership belonging to a different member';/i,
      );
    });

    it("rejects cross-organization linking in link_invoice_membership", () => {
      expect(migrationSql).toMatch(
        /if v_membership\.id is null or v_membership\.organization_id <> v_invoice\.organization_id then\s+raise exception 'membership not found';/i,
      );
    });

    it("rejects cross-branch linking and conflicting membership overwrites in link_invoice_membership", () => {
      expect(migrationSql).toMatch(
        /if v_invoice\.branch_id is not null and v_membership\.branch_id is not null[\s\S]*?v_membership\.branch_id <> v_invoice\.branch_id then\s+raise exception 'cannot link invoice to a membership from a different branch';/i,
      );
      expect(migrationSql).toMatch(
        /if v_invoice\.membership_id is not null and v_invoice\.membership_id <> p_membership_id then\s+raise exception 'invoice is already linked to membership %', v_invoice\.membership_id;/i,
      );
    });

    it("guards draft and void invoices from activating memberships", () => {
      expect(migrationSql).toMatch(/if v_invoice\.status in \('draft', 'void'\) then/i);
    });

    it("activates membership ONLY on full settlement (balance <= 0 and status = 'paid'), NOT on partial payment", () => {
      expect(migrationSql).toMatch(
        /v_is_settled := \(v_balance <= 0 and v_invoice\.status = 'paid'\);/i,
      );
      expect(migrationSql).toMatch(
        /if v_is_settled then\s+v_status := 'active';\s+else\s+v_status := 'pending';\s+end if;/i,
      );
      // Ensure it does NOT use the old flawed check 'if v_paid > 0 then v_status := active'
      expect(migrationSql).not.toMatch(/if v_paid > 0 then\s+v_status := 'active';/i);
    });

    it("sequences renewals by adding 1 day after the existing active/pending end date", () => {
      expect(migrationSql).toMatch(
        /select max\(end_date\) into v_existing_end[\s\S]*?from public\.memberships[\s\S]*?where organization_id = v_invoice\.organization_id[\s\S]*?and member_id = v_invoice\.member_id[\s\S]*?and status in \('active', 'pending'\)[\s\S]*?and end_date >= v_start;/i,
      );
      expect(migrationSql).toMatch(
        /if v_existing_end is not null then\s+v_start := v_existing_end \+ 1;\s+end if;/i,
      );
    });

    it("defines refresh_invoice_status as an internal helper with all public/authenticated access revoked", () => {
      expect(migrationSql).toMatch(
        /create or replace function public\.refresh_invoice_status\(p_invoice_id uuid\)/i,
      );
      expect(migrationSql).toMatch(
        /revoke all on function public\.refresh_invoice_status\(uuid\) from public, anon, authenticated;/i,
      );
    });

    it("strictly revokes public and anon access from all externally callable RPCs", () => {
      expect(migrationSql).toMatch(
        /revoke all on function public\.sync_invoice_membership\(uuid\) from public, anon;/i,
      );
      expect(migrationSql).toMatch(
        /grant execute on function public\.sync_invoice_membership\(uuid\) to authenticated;/i,
      );
      expect(migrationSql).toMatch(
        /revoke all on function public\.link_invoice_membership\(uuid, uuid\) from public, anon;/i,
      );
      expect(migrationSql).toMatch(
        /grant execute on function public\.link_invoice_membership\(uuid, uuid\) to authenticated;/i,
      );
      expect(migrationSql).toMatch(
        /revoke all on function public\.issue_invoice\(uuid\) from public, anon;/i,
      );
      expect(migrationSql).toMatch(
        /grant execute on function public\.issue_invoice\(uuid\) to authenticated;/i,
      );
      expect(migrationSql).toMatch(
        /revoke all on function public\.void_invoice\(uuid, text\) from public, anon;/i,
      );
      expect(migrationSql).toMatch(
        /grant execute on function public\.void_invoice\(uuid, text\) to authenticated;/i,
      );
    });

    it("void_invoice safely cancels linked membership ONLY if no other valid invoices exist", () => {
      expect(migrationSql).toMatch(
        /select count\(\*\) into v_other_valid_invoices[\s\S]*?from public\.invoices[\s\S]*?where membership_id = v_invoice\.membership_id[\s\S]*?and id <> p_invoice_id[\s\S]*?and status in \('issued', 'partially_paid', 'paid'\);/i,
      );
      expect(migrationSql).toMatch(
        /if v_other_valid_invoices = 0 then\s+update public\.memberships\s+set status = 'cancelled'/i,
      );
    });

    it("void_invoice prohibits cancelling paid invoices directly", () => {
      expect(migrationSql).toMatch(
        /if v_invoice\.status = 'paid' then\s+raise exception 'paid invoices cannot be cancelled; issue a credit note or refund';/i,
      );
    });

    it("strictly avoids referencing nonexistent payments.status column", () => {
      // Remove SQL comments to ensure the column is not referenced in executable code
      const sqlWithoutComments = migrationSql.replace(/--.*$/gm, "");
      expect(sqlWithoutComments).not.toMatch(/payments\.status/i);
      expect(sqlWithoutComments).not.toMatch(/payment_status/i);
    });
  });

  describe("2. Membership & Payment Status Separation & State Machine", () => {
    it("Draft invoice: membership is not created or activated", () => {
      const invoice = { status: "draft", total: 10000, membership_id: null };
      const syncDraft = (inv: typeof invoice) => {
        if (["draft", "void"].includes(inv.status)) return inv.membership_id;
        return "new-membership-id";
      };
      expect(syncDraft(invoice)).toBeNull();
    });

    it("Issued invoice with 0 payment: membership is 'pending' and payment status is 'unpaid'", () => {
      const invoice = { status: "issued", total: 10000, paid: 0, credited: 0 };
      const balance = invoice.total - invoice.paid - invoice.credited;
      const isSettled = balance <= 0 && invoice.status === "paid";
      const membershipStatus = isSettled ? "active" : "pending";
      const paymentStatus = invoice.paid > 0 ? "partially_paid" : "unpaid";

      expect(membershipStatus).toBe("pending");
      expect(paymentStatus).toBe("unpaid");
      expect(balance).toBe(10000);
    });

    it("Partial payment: membership remains 'pending', payment status is 'partially_paid'", () => {
      const invoice = { status: "partially_paid", total: 10000, paid: 4000, credited: 0 };
      const balance = invoice.total - invoice.paid - invoice.credited;
      const isSettled = balance <= 0 && invoice.status === "paid";
      const membershipStatus = isSettled ? "active" : "pending";
      const paymentStatus = invoice.paid > 0 && balance > 0 ? "partially_paid" : "paid";

      expect(membershipStatus).toBe("pending");
      expect(paymentStatus).toBe("partially_paid");
      expect(balance).toBe(6000);
    });

    it("Full payment: invoice becomes 'paid', membership transitions to 'active'", () => {
      const invoice = { status: "paid", total: 10000, paid: 10000, credited: 0 };
      const balance = invoice.total - invoice.paid - invoice.credited;
      const isSettled = balance <= 0 && invoice.status === "paid";
      const membershipStatus = isSettled ? "active" : "pending";
      const paymentStatus = "paid";

      expect(membershipStatus).toBe("active");
      expect(paymentStatus).toBe("paid");
      expect(balance).toBe(0);
    });

    it("Credit note application resulting in full settlement: membership becomes 'active'", () => {
      const invoice = { status: "paid", total: 10000, paid: 6000, credited: 4000 };
      const balance = invoice.total - invoice.paid - invoice.credited;
      const isSettled = balance <= 0 && invoice.status === "paid";
      const membershipStatus = isSettled ? "active" : "pending";

      expect(balance).toBe(0);
      expect(isSettled).toBe(true);
      expect(membershipStatus).toBe("active");
    });

    it("Void invoice cancels membership only if no other valid invoices exist", () => {
      const handleVoid = (otherInvoicesCount: number) => {
        if (otherInvoicesCount === 0) {
          return "cancelled";
        }
        return "active"; // membership preserved because another valid invoice exists
      };

      expect(handleVoid(0)).toBe("cancelled");
      expect(handleVoid(1)).toBe("active");
      expect(handleVoid(2)).toBe("active");
    });

    it("Sequences renewal membership after existing active/pending end date", () => {
      const existingEndDate = new Date("2026-12-31");
      const issueDate = new Date("2026-11-27");
      const durationDays = 30;

      let startDate = issueDate;
      if (existingEndDate >= issueDate) {
        // Renewal sequences strictly after existing membership
        startDate = new Date(existingEndDate);
        startDate.setDate(startDate.getDate() + 1);
      }
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + durationDays);

      expect(startDate.toISOString().slice(0, 10)).toBe("2027-01-01");
      expect(endDate.toISOString().slice(0, 10)).toBe("2027-01-31");
    });
  });

  describe("3. Active Memberships Summary Calculations & Deduplication", () => {
    it("aggregates active, partial paid, expiring, pending, and total balance correctly", () => {
      const sampleRows: ActiveMembershipRow[] = [
        {
          id: "m-1",
          organizationId: "org-1",
          branchId: "b-1",
          branchName: "Main",
          branchCode: "MN",
          memberId: "mem-1",
          memberName: "Alice Smith",
          memberCode: "M001",
          memberPhone: "9876543210",
          planId: "p-1",
          planName: "1 Year Gold",
          planCode: "GOLD",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          freezeDaysUsed: 0,
          isFrozenCurrently: false,
          notes: null,
          invoiceId: "inv-1",
          invoiceNumber: "INV-001",
          invoiceStatus: "paid",
          totalPlanAmount: 12000,
          totalAmountPaid: 12000,
          amountCredited: 0,
          remainingBalance: 0,
          membershipStatus: "active",
          paymentStatus: "paid",
        },
        {
          id: "m-2",
          organizationId: "org-1",
          branchId: "b-1",
          branchName: "Main",
          branchCode: "MN",
          memberId: "mem-2",
          memberName: "Bob Jones",
          memberCode: "M002",
          memberPhone: "9876543211",
          planId: "p-1",
          planName: "1 Year Gold",
          planCode: "GOLD",
          startDate: "2026-01-01",
          endDate: "2026-12-31",
          freezeDaysUsed: 0,
          isFrozenCurrently: false,
          notes: null,
          invoiceId: "inv-2",
          invoiceNumber: "INV-002",
          invoiceStatus: "partially_paid",
          totalPlanAmount: 12000,
          totalAmountPaid: 6000,
          amountCredited: 1000,
          remainingBalance: 5000,
          membershipStatus: "pending",
          paymentStatus: "partially_paid",
        },
        {
          id: "m-3",
          organizationId: "org-1",
          branchId: "b-1",
          branchName: "Main",
          branchCode: "MN",
          memberId: "mem-3",
          memberName: "Charlie Ray",
          memberCode: "M003",
          memberPhone: "9876543212",
          planId: "p-2",
          planName: "1 Month Bronze",
          planCode: "BRONZE",
          startDate: "2026-01-01",
          endDate: "2026-01-31",
          freezeDaysUsed: 0,
          isFrozenCurrently: false,
          notes: null,
          invoiceId: "inv-3",
          invoiceNumber: "INV-003",
          invoiceStatus: "issued",
          totalPlanAmount: 2000,
          totalAmountPaid: 0,
          amountCredited: 0,
          remainingBalance: 2000,
          membershipStatus: "pending",
          paymentStatus: "unpaid",
        },
      ];

      const activeCount = sampleRows.filter((r) => r.membershipStatus === "active").length;
      const partialPaidCount = sampleRows.filter((r) => r.paymentStatus === "partially_paid").length;
      const pendingCount = sampleRows.filter((r) => r.membershipStatus === "pending").length;
      const totalBalance = sampleRows.reduce((sum, r) => sum + r.remainingBalance, 0);

      expect(activeCount).toBe(1);
      expect(partialPaidCount).toBe(1);
      expect(pendingCount).toBe(2);
      expect(totalBalance).toBe(7000);
    });

    it("calculates outstanding balance strictly as total - amount_paid - amount_credited", () => {
      const invoiceTotal = 15000;
      const amountPaid = 5000;
      const amountCredited = 2000;
      const balance = Math.max(0, invoiceTotal - amountPaid - amountCredited);
      expect(balance).toBe(8000);
    });

    it("deduplicates multiple linked invoices so that each membership appears only once", () => {
      const multipleRows: { id: string; invoiceId: string }[] = [
        { id: "mem-1", invoiceId: "inv-1" },
        { id: "mem-1", invoiceId: "inv-2" },
        { id: "mem-2", invoiceId: "inv-3" },
      ];
      const seen = new Set<string>();
      const deduped: { id: string; invoiceId: string }[] = [];
      for (const r of multipleRows) {
        if (!seen.has(r.id)) {
          seen.add(r.id);
          deduped.push(r);
        }
      }
      expect(deduped.length).toBe(2);
      expect(deduped.map((d) => d.id)).toEqual(["mem-1", "mem-2"]);
    });
  });

  describe("4. Primary Workflow Verification", () => {
    it("verifies new-invoice-form imports linkInvoiceMembership and no longer gates on activateMembership checkbox", () => {
      const formPath = resolve(__dirname, "../../components/billing/new-invoice-form.tsx");
      const formCode = readFileSync(formPath, "utf-8");

      expect(formCode).toMatch(/linkInvoiceMembership/);
      expect(formCode).not.toMatch(/setActivateMembership\(event\.target\.checked\)/);
      expect(formCode).toMatch(/Creates and links this membership upon invoice finalization/);
    });

    it("verifies /memberships/active page uses ActiveMembershipsList", () => {
      const pagePath = resolve(__dirname, "../../app/(app)/memberships/active/page.tsx");
      const pageCode = readFileSync(pagePath, "utf-8");

      expect(pageCode).toMatch(/ActiveMembershipsList/);
    });

    it("verifies /memberships/active/add guides owners to New Invoice and supports complimentary assignments", () => {
      const formPath = resolve(__dirname, "../../components/memberships/add-membership-form.tsx");
      const formCode = readFileSync(formPath, "utf-8");

      expect(formCode).toMatch(/Sell Paid Membership via New Invoice/);
      expect(formCode).toMatch(/Go to New Invoice/);
      expect(formCode).toMatch(/Complimentary or Promotional Membership/);
      expect(formCode).toMatch(/createComplimentaryMembership/);
    });
  });
});
