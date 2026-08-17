"use client";

import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface StepperProps {
  steps: readonly string[];
  current: number;
}

/** Horizontal step indicator for the onboarding wizard. */
export function Stepper({ steps, current }: StepperProps) {
  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Onboarding progress">
      {steps.map((step, index) => {
        const isComplete = index < current;
        const isActive = index === current;
        return (
          <li key={step} className="flex flex-1 flex-col items-center gap-1.5 sm:flex-row">
            <span
              aria-current={isActive ? "step" : undefined}
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors sm:size-8",
                isComplete && "bg-primary-600 text-white",
                isActive && "bg-primary-100 text-primary-800 ring-2 ring-primary-600",
                !isComplete && !isActive && "bg-neutral-100 text-neutral-400",
              )}
            >
              {isComplete ? <Check aria-hidden="true" className="size-4" /> : index + 1}
            </span>
            <span
              className={cn(
                "text-[11px] font-medium sm:text-xs",
                isActive ? "text-ink" : isComplete ? "text-neutral-600" : "text-neutral-400",
              )}
            >
              {step}
            </span>
            {index < steps.length - 1 && (
              <span
                aria-hidden="true"
                className={cn(
                  "hidden h-px flex-1 bg-border sm:block",
                  isComplete && "bg-primary-500",
                )}
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}
