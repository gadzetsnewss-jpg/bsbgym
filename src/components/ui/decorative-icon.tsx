import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface DecorativeIconProps {
  icon: LucideIcon;
  className?: string;
  wrapperClassName?: string;
}

/**
 * Renders a Lucide icon that never contributes to the accessible name.
 * Prevents leaked SVG labels such as "svgActive Memberships".
 */
export function DecorativeIcon({
  icon: Icon,
  className,
  wrapperClassName,
}: DecorativeIconProps) {
  return (
    <span aria-hidden="true" className={cn("inline-flex shrink-0", wrapperClassName)}>
      <Icon focusable="false" className={className} />
    </span>
  );
}
