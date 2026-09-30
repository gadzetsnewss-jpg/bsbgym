import type { Metadata } from "next";
import { Suspense } from "react";
import { AddClassBookingForm } from "@/components/classes/add-class-booking-form";
import { LoadingState } from "@/components/ui/loading-state";

export const metadata: Metadata = { title: "Add booking" };

export default function AddClassBookingPage() {
  return (
    <Suspense fallback={<LoadingState label="Loading booking form…" />}>
      <AddClassBookingForm />
    </Suspense>
  );
}
