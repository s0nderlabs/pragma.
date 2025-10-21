"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { cn } from "../../lib/utils";
import { usePrefersReducedMotion } from "../../hooks/usePrefersReducedMotion";

interface QuickModeToggleProps {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  disabled?: boolean;
}

export function QuickModeToggle({ enabled, onChange, disabled = false }: QuickModeToggleProps) {
  const pillRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  // Animate pill sliding
  useEffect(() => {
    if (!pillRef.current || prefersReducedMotion) return;

    gsap.to(pillRef.current, {
      x: enabled ? "100%" : "0%",
      duration: 0.3,
      ease: "power3.out",
    });
  }, [enabled, prefersReducedMotion]);

  return (
    <button
      type="button"
      onClick={() => !disabled && onChange(!enabled)}
      disabled={disabled}
      className={cn(
        "relative inline-flex items-center justify-center rounded-full border p-1 text-sm shadow-sm transition-all duration-200",
        "border-[#846FFA]/30 bg-white/60 backdrop-blur-lg dark:border-[#846FFA]/35 dark:bg-[#1E1E27]/70",
        disabled
          ? "cursor-not-allowed"
          : "cursor-pointer hover:bg-white/80 dark:hover:bg-[#1E1E27]/85"
      )}
      aria-label={`Quick Mode: ${enabled ? "On" : "Off"}`}
      aria-pressed={enabled}
    >
      {/* Sliding pill background */}
      <div
        ref={pillRef}
        className="absolute left-1 top-1 bottom-1 w-[calc(50%-0.25rem)] rounded-full bg-gradient-to-r from-[#846FFA]/55 to-[#674CF9]/60 shadow-[0_12px_28px_rgba(132,111,250,0.35)]"
      />

      {/* Off text */}
      <span
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-200",
          !enabled ? "text-[#2F285F] dark:text-[#F8F8FF]" : "text-[#5C5C5C] dark:text-[#C7C3E8]/80"
        )}
      >
        Off
      </span>

      {/* On text */}
      <span
        className={cn(
          "relative z-10 flex flex-1 items-center justify-center whitespace-nowrap px-4 py-1 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-200",
          enabled ? "text-[#2F285F] dark:text-[#F8F8FF]" : "text-[#5C5C5C] dark:text-[#C7C3E8]/80"
        )}
      >
        On
      </span>
    </button>
  );
}
