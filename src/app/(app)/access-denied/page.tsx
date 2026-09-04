import type { Metadata } from "next";
import { AccessDenied } from "@/components/auth/access-denied";

export const metadata: Metadata = {
  title: "Access Denied",
};

export default function AccessDeniedPage() {
  return <AccessDenied />;
}
