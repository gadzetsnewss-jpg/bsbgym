import Link from "next/link";
import { CreditCard } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DecorativeIcon } from "@/components/ui/decorative-icon";

export function MembershipBillingHandoff({
  context = "assign",
  memberId,
  membershipId,
}: {
  context?: "assign" | "renew" | "upgrade" | "freeze" | "extend";
  memberId?: string;
  membershipId?: string;
}) {
  const copy = {
    assign: "Assigning a plan does not collect payment. Create an invoice in Billing when you are ready to charge.",
    renew: "Renewal updates the membership dates and plan. Invoices and payments stay in Billing.",
    upgrade: "Changing the plan here does not create an invoice. Use Billing to charge the difference.",
    freeze: "Freeze pauses the membership timeline. Any freeze fee is recorded in Billing, not here.",
    extend: "Extension adds days to the current end date. This does not collect payment. Use Billing if a fee applies.",
  }[context];
  const params = new URLSearchParams();
  if (memberId) params.set("memberId", memberId);
  if (membershipId) params.set("membershipId", membershipId);
  const href = params.size > 0 ? `/billing/new-invoice?${params.toString()}` : "/billing";

  return (
    <Card className="flex items-start gap-3 border-primary-100 bg-primary-50/60">
      <DecorativeIcon icon={CreditCard} className="mt-0.5 size-4 text-primary-700" />
      <p className="text-sm text-primary-900">
        {copy}{" "}
        <Link href={href} className="font-medium underline underline-offset-2">
          {params.size > 0 ? "Create invoice" : "Open Billing"}
        </Link>
      </p>
    </Card>
  );
}
