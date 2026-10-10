"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";

export function SettingsViewOnly() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>View only</CardTitle>
      </CardHeader>
      <p className="text-sm text-neutral-500">Your role can view these defaults but cannot change them.</p>
    </Card>
  );
}

export function SettingsSavedBanner({ visible }: { visible: boolean }) {
  if (!visible) return null;
  return (
    <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-sm font-medium text-emerald-700">
      Changes saved successfully.
    </div>
  );
}

export function SettingsActions({
  canManage,
  submitting,
  dirty,
  onReset,
}: {
  canManage: boolean;
  submitting: boolean;
  dirty: boolean;
  onReset: () => void;
}) {
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap items-center justify-end gap-2">
      <Button type="button" variant="outline" onClick={onReset} disabled={submitting || !dirty}>
        Restore defaults
      </Button>
      <Button type="submit" isLoading={submitting} disabled={!dirty && !submitting}>
        Save changes
      </Button>
    </div>
  );
}
