"use client";

import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Track whether a CSS media query matches. Used for responsive shell logic.
 */
export function useMediaQuery(query: string): boolean {
  const getMatches = () => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  };

  const [matches, setMatches] = React.useState<boolean>(getMatches);

  React.useEffect(() => {
    const media = window.matchMedia(query);
    const onChange = () => setMatches(media.matches);
    onChange();
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
