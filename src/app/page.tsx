import { redirect } from "next/navigation";
import { APP_HOME } from "@/config/navigation";

export default function RootPage() {
  redirect(APP_HOME);
}
