"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { cn } from "../../lib/utils";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";
import type { Mode } from "@pragma/core";

interface ModeToggleProps {
  mode: Mode;
  onChange: (mode: Mode) => void;
  disabled?: boolean;
}

export function ModeToggle({ mode, onChange, disabled = false }: ModeToggleProps) {
  const pillRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Animate pill sliding
  useEffect(() => {
    if (!pillRef.current || prefersReducedMotion) return;

    gsap.to(pillRef.current, {
      x: mode === "normal" ? "100%" : "0%",
      duration: 0.3,
      ease: "power3.out",
    });
  }, [mode, prefersReducedMotion]);

  return (
    <div
      className="inline-flex items-center rounded-full border border-[#846FFA]/30 bg-white/60 backdrop-blur-lg p-1 text-sm shadow-sm dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70 relative transition-all duration-200 hover:bg-white/75 dark:hover:bg-[#1E1E27]/80"
      role="tablist"
    >
      {/* Sliding pill background */}
      <div
        ref={pillRef}
        className="absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-to-r from-[#846FFA]/30 to-[#674CF9]/35 shadow-[0_10px_24px_rgba(132,111,250,0.22)]"
        style={{ opacity: disabled ? 0.5 : 1 }}
      />

      {/* Safe button */}
      <button
        type="button"
        data-testid="mode-option-safe"
        onClick={() => !disabled && onChange("safe")}
        disabled={disabled}
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-200",
          mode === "safe" ? "text-[#2F285F] dark:text-[#F8F8FF]" : "text-[#5C5C5C] hover:text-[#2F285F] dark:text-[#C7C3E8]/80 dark:hover:text-[#F8F8FF]",
          disabled && "cursor-not-allowed opacity-50"
        )}
        aria-pressed={mode === "safe"}
      >
        Safe
      </button>

      {/* Normal button */}
      <button
        type="button"
        data-testid="mode-option-normal"
        onClick={() => !disabled && onChange("normal")}
        disabled={disabled}
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap px-6 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-200",
          mode === "normal" ? "text-[#2F285F] dark:text-[#F8F8FF]" : "text-[#5C5C5C] hover:text-[#2F285F] dark:text-[#C7C3E8]/80 dark:hover:text-[#F8F8FF]",
          disabled && "cursor-not-allowed opacity-50"
        )}
        aria-pressed={mode === "normal"}
      >
        Normal
      </button>
    </div>
  );
}
