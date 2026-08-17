import * as React from "react";
import { cn } from "@/lib/utils";

export interface UserAvatarProps {
  name: string;
  /** Optional image source. Falls back to initials. */
  src?: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeClasses = {
  sm: "size-7 text-[11px]",
  md: "size-9 text-xs",
  lg: "size-12 text-base",
};

export function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function UserAvatar({ name, src, size = "md", className }: UserAvatarProps) {
  if (src) {
    return (
      <span
        aria-hidden="true"
        className={cn(
          "inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full bg-neutral-100",
          sizeClasses[size],
          className,
        )}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={src} alt="" className="size-full object-cover" />
      </span>
    );
  }

  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full bg-primary-700 font-semibold text-white",
        sizeClasses[size],
        className,
      )}
    >
      {initialsOf(name)}
    </span>
  );
}
