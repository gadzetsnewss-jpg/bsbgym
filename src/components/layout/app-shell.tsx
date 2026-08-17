"use client";

import * as React from "react";
import { cn } from "@/lib/utils";
import { SidebarProvider, useSidebar } from "@/hooks/use-sidebar";
import { Sidebar } from "@/components/layout/sidebar";
import { Header } from "@/components/layout/header";

function Shell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen">
      <Sidebar />

      <div
        className={cn(
          "flex min-h-screen flex-col transition-[padding] duration-200",
          collapsed ? "lg:pl-[72px]" : "lg:pl-64",
        )}
      >
        <Header />

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-6 sm:px-6 lg:px-8">
          {children}
        </main>

        <footer className="border-t border-border px-4 py-4 sm:px-6">
          <p className="text-center text-xs text-neutral-400">
            © {new Date().getFullYear()} BSB FitForge · Cloud gym management
            platform
          </p>
        </footer>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <Shell>{children}</Shell>
    </SidebarProvider>
  );
}
