import { MembershipHistory } from "@/components/memberships/membership-history";
import { MembershipLifecycleActions } from "@/components/memberships/membership-actions";
import { MembershipFreezeHistory } from "@/components/memberships/membership-freeze-history";
import { MembershipRelatedBilling } from "@/components/memberships/membership-related-billing";
import type { MembershipRow } from "@/lib/operations/adapters";

export function membershipDetailExtras(row: MembershipRow) {
  return (
    <div className="space-y-6">
      <MembershipLifecycleActions row={row} />
      <MembershipFreezeHistory row={row} />
      <MembershipRelatedBilling row={row} />
      <MembershipHistory membershipId={row.id} />
    </div>
  );
}
