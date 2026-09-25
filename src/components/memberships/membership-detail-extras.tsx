import { MembershipHistory } from "@/components/memberships/membership-history";
import { MembershipLifecycleActions } from "@/components/memberships/membership-actions";
import type { MembershipRow } from "@/lib/operations/adapters";

export function membershipDetailExtras(row: MembershipRow) {
  return (
    <div className="space-y-6">
      <MembershipLifecycleActions row={row} />
      <MembershipHistory membershipId={row.id} />
    </div>
  );
}
