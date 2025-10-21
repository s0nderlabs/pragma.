"use client";

import * as React from "react";
import * as CheckboxPrimitive from "@radix-ui/react-checkbox";
import { Check } from "lucide-react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

import { cn } from "../../lib/utils";

const Checkbox = React.forwardRef<React.ElementRef<typeof CheckboxPrimitive.Root>, React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root>>(
  ({ className, ...props }, ref) => {
    const indicatorRef = React.useRef<HTMLSpanElement>(null);
    const prefersReducedMotion = usePrefersReducedMotion();

    // Spring animation on check/uncheck
    React.useEffect(() => {
      if (!indicatorRef.current || prefersReducedMotion) return;

      const indicator = indicatorRef.current;

      // When indicator mounts (checked), animate in with spring
      if (indicator.dataset.state === "checked") {
        gsap.fromTo(
          indicator,
          { scale: 0, opacity: 0 },
          {
            scale: 1,
            opacity: 1,
            duration: 0.4,
            ease: "back.out(1.7)",
          }
        );
      }
    }, [props.checked, prefersReducedMotion]);

    return (
      <CheckboxPrimitive.Root
        ref={ref}
        className={cn(
          "peer h-4 w-4 shrink-0 rounded border border-input bg-background shadow transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#846FFA] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
          className,
        )}
        {...props}
      >
        <CheckboxPrimitive.Indicator
          ref={indicatorRef}
          className={cn("flex items-center justify-center text-current")}
        >
          <Check className="h-3.5 w-3.5" />
        </CheckboxPrimitive.Indicator>
      </CheckboxPrimitive.Root>
    );
  },
);
Checkbox.displayName = CheckboxPrimitive.Root.displayName;

export { Checkbox };
