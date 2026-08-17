import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ToastProvider } from "@/components/ui/toast";
import "@/app/globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: {
    default: "BSB FitForge",
    template: "%s | BSB FitForge",
  },
  description:
    "BSB FitForge - Professional cloud-based gym management ERP/SaaS for fitness businesses.",
  applicationName: "BSB FitForge",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="min-h-screen bg-surface-muted">
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
