import type { Metadata } from "next";
import { Suspense } from "react";
import { AddClassSessionForm } from "@/components/classes/add-class-session-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Schedule session" };

export default function AddClassSessionPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading session form…" />}>
      <AddClassSessionForm />
    </Suspense>
  );
}
