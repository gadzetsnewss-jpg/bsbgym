"use client";

import * as React from "react";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DropdownItem {
  label: string;
  icon?: LucideIcon;
  href?: string;
  onClick?: () => void;
  variant?: "default" | "danger";
  disabled?: boolean;
  shortcut?: string;
  /** Renders a separator above this item. */
  separator?: boolean;
}

export interface DropdownProps {
  /** Rendered inside the trigger button. */
  children: React.ReactNode;
  items: DropdownItem[];
  align?: "start" | "end";
  className?: string;
  menuClassName?: string;
  triggerClassName?: string;
  /** aria-label for the trigger button. */
  label: string;
  /** Optionally renders a chevron after the trigger content. */
  chevron?: boolean;
}

export function Dropdown({
  children,
  items,
  align = "end",
  className,
  menuClassName,
  triggerClassName,
  label,
  chevron = true,
}: DropdownProps) {
  const [open, setOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const menuRef = React.useRef<HTMLDivElement>(null);

  const close = React.useCallback(() => setOpen(false), []);

  const toggle = React.useCallback(() => setOpen((prev) => !prev), []);

  // Focus the first item when opened.
  React.useEffect(() => {
    if (open) {
      const first = menuRef.current?.querySelector<HTMLElement>(
        '[role="menuitem"]',
      );
      first?.focus();
    }
  }, [open]);

  // Close on outside click.
  React.useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent | TouchEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        close();
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open, close]);

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const menuItems = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? [],
    );
    if (menuItems.length === 0) return;
    const currentIndex = menuItems.indexOf(
      document.activeElement as HTMLElement,
    );
    let nextIndex = currentIndex;

    if (event.key === "ArrowDown") nextIndex = (currentIndex + 1) % menuItems.length;
    else if (event.key === "ArrowUp")
      nextIndex = (currentIndex - 1 + menuItems.length) % menuItems.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = menuItems.length - 1;
    else if (event.key === "Escape") {
      event.preventDefault();
      close();
      containerRef.current?.querySelector<HTMLElement>("button")?.focus();
      return;
    } else if (event.key === "Tab") {
      close();
      return;
    } else return;

    event.preventDefault();
    menuItems[nextIndex]?.focus();
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={label}
        onClick={toggle}
        className={cn(
          "inline-flex items-center gap-2 rounded-lg text-sm font-medium text-ink transition-colors",
          "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
          triggerClassName,
        )}
      >
        {children}
        {chevron && (
          <ChevronDown
            aria-hidden="true"
            className={cn(
              "size-4 text-neutral-400 transition-transform",
              open && "rotate-180",
            )}
          />
        )}
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label={label}
          onKeyDown={onMenuKeyDown}
          className={cn(
            "absolute top-full z-50 mt-2 min-w-48 rounded-lg border border-border bg-surface p-1.5 shadow-pop",
            align === "end" ? "right-0" : "left-0",
            menuClassName,
          )}
        >
          {items.map((item, index) => {
            const Icon = item.icon;
            const content = (
              <>
                {Icon && (
                  <Icon
                    aria-hidden="true"
                    className={cn(
                      "size-4 shrink-0",
                      item.variant === "danger"
                        ? "text-red-500"
                        : "text-neutral-400",
                    )}
                  />
                )}
                <span className="flex-1 text-left">{item.label}</span>
                {item.shortcut && (
                  <kbd className="ml-4 font-mono text-xs text-neutral-400">
                    {item.shortcut}
                  </kbd>
                )}
              </>
            );

            const itemClass = cn(
              "flex w-full cursor-pointer select-none items-center gap-2 rounded-md px-2.5 py-2 text-sm transition-colors",
              "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:outline-none",
              item.disabled && "cursor-not-allowed opacity-50",
              !item.disabled &&
                (item.variant === "danger"
                  ? "text-red-600 hover:bg-red-50"
                  : "text-ink hover:bg-primary-50"),
            );

            const handleClick = () => {
              if (item.disabled) return;
              item.onClick?.();
              close();
            };

            return (
              <React.Fragment key={`${item.label}-${index}`}>
                {item.separator && (
                  <div className="my-1 h-px bg-border" role="separator" />
                )}
                {item.href ? (
                  <Link
                    href={item.href}
                    role="menuitem"
                    tabIndex={-1}
                    aria-disabled={item.disabled}
                    className={itemClass}
                    onClick={() => {
                      if (item.disabled) return;
                      close();
                    }}
                  >
                    {content}
                  </Link>
                ) : (
                  <button
                    type="button"
                    role="menuitem"
                    tabIndex={-1}
                    disabled={item.disabled}
                    onClick={handleClick}
                    className={itemClass}
                  >
                    {content}
                  </button>
                )}
              </React.Fragment>
            );
          })}
        </div>
      )}
    </div>
  );
}