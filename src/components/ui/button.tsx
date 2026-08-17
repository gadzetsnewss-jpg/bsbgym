import * as React from "react";
import Link from "next/link";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export type ButtonVariant =
  | "primary"
  | "secondary"
  | "outline"
  | "ghost"
  | "destructive"
  | "link";

export type ButtonSize = "sm" | "md" | "lg" | "icon";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Shows an inline loading spinner and disables the button. */
  isLoading?: boolean;
  /** Renders the button as a full-width block. */
  fullWidth?: boolean;
}

export interface ButtonLinkProps
  extends Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> {
  href: string;
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-primary-700 text-white hover:bg-primary-800 active:bg-primary-900 shadow-card",
  secondary:
    "bg-primary-50 text-primary-800 hover:bg-primary-100 active:bg-primary-200 border border-primary-200",
  outline:
    "bg-white text-ink border border-border hover:bg-neutral-50 active:bg-neutral-100",
  ghost: "bg-transparent text-ink hover:bg-neutral-100 active:bg-neutral-200",
  destructive:
    "bg-red-600 text-white hover:bg-red-700 active:bg-red-800 shadow-card",
  link: "bg-transparent text-primary-700 hover:text-primary-800 underline-offset-4 hover:underline p-0 h-auto",
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-base gap-2",
  icon: "h-10 w-10",
};

export const buttonClasses = (opts: {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
}) =>
  cn(
    "inline-flex select-none items-center justify-center whitespace-nowrap rounded-lg font-medium transition-colors",
    "focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2",
    variantClasses[opts.variant ?? "primary"],
    sizeClasses[opts.size ?? "md"],
    opts.fullWidth && "w-full",
    opts.className,
  );

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = "primary",
      size = "md",
      isLoading = false,
      fullWidth = false,
      disabled,
      children,
      type = "button",
      ...props
    },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        type={type}
        disabled={disabled || isLoading}
        className={cn(
          buttonClasses({ variant, size, fullWidth }),
          "disabled:pointer-events-none disabled:opacity-50",
          className,
        )}
        {...props}
      >
        {isLoading && (
          <LoaderCircle className="size-4 animate-spin" aria-hidden="true" />
        )}
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";

/** Button styled as a Next.js link. */
export function ButtonLink({
  className,
  variant,
  size,
  fullWidth,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <Link
      className={buttonClasses({ variant, size, fullWidth, className })}
      {...props}
    >
      {children}
    </Link>
  );
}
