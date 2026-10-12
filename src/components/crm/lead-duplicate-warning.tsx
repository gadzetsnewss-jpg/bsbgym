"use client";

import * as React from "react";
import { ButtonLink } from "@/components/ui/button";
import { findMatchingLeads } from "@/lib/crm/client";
import type { ResourceValues } from "@/lib/crud/types";

export function LeadDuplicateWarning({
  values,
  organizationId,
  excludeId,
}: {
  values: ResourceValues;
  organizationId: string;
  excludeId?: string;
}) {
  const phone = typeof values.phone === "string" ? values.phone.trim() : "";
  const email = typeof values.email === "string" ? values.email.trim() : "";
  const [matches, setMatches] = React.useState<{ id: string; fullName: string }[]>([]);

  React.useEffect(() => {
    if (!organizationId || (!phone && !email)) {
      setMatches([]);
      return;
    }
    const timeout = setTimeout(() => {
      void findMatchingLeads({ organizationId, phone, email, excludeId }).then((result) => {
        setMatches(result.data ?? []);
      });
    }, 400);
    return () => clearTimeout(timeout);
  }, [organizationId, phone, email, excludeId]);

  if (matches.length === 0) return null;

  return (
    <div className="rounded-card border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
      <p className="font-medium">A similar lead may already exist.</p>
      <p className="mt-1">Open the existing record instead of creating a duplicate.</p>
      <div className="mt-2 flex flex-wrap gap-2">
        {matches.map((lead) => (
          <ButtonLink key={lead.id} href={`/crm/leads/${lead.id}`} variant="outline" size="sm">
            {lead.fullName}
          </ButtonLink>
        ))}
      </div>
    </div>
  );
}
