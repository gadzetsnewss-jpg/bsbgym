"use client";

import * as React from "react";

interface SidebarContextValue {
  /** Desktop sidebar collapsed to icon-only. */
  collapsed: boolean;
  toggleCollapsed: () => void;
  /** Mobile off-canvas navigation visibility. */
  mobileOpen: boolean;
  openMobile: () => void;
  closeMobile: () => void;
  toggleMobile: () => void;
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null);

const STORAGE_KEY = "bsb-fitforge.sidebar.collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = React.useState<boolean>(false);
  const [mobileOpen, setMobileOpen] = React.useState<boolean>(false);

  // Rehydrate the persisted collapsed state once on mount.
  React.useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored !== null) setCollapsed(stored === "true");
    } catch {
      /* ignore storage errors */
    }
  }, []);

  const toggleCollapsed = React.useCallback(() => {
    setCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(STORAGE_KEY, String(next));
      } catch {
        /* ignore storage errors */
      }
      return next;
    });
  }, []);

  const openMobile = React.useCallback(() => setMobileOpen(true), []);
  const closeMobile = React.useCallback(() => setMobileOpen(false), []);
  const toggleMobile = React.useCallback(
    () => setMobileOpen((prev) => !prev),
    [],
  );

  const value = React.useMemo(
    () => ({
      collapsed,
      toggleCollapsed,
      mobileOpen,
      openMobile,
      closeMobile,
      toggleMobile,
    }),
    [collapsed, toggleCollapsed, mobileOpen, openMobile, closeMobile, toggleMobile],
  );

  return (
    <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>
  );
}

export function useSidebar(): SidebarContextValue {
  const context = React.useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a <SidebarProvider>");
  }
  return context;
}
