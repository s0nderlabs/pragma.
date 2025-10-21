"use client";

import React, { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";

interface Position {
  left: number;
  width: number;
  height: number;
  opacity: number;
}

interface GlassSlideTabsProps {
  tabs: string[];
  activeIndex: number;
  onChange: (index: number) => void;
  disabled?: boolean;
}

export const GlassSlideTabs: React.FC<GlassSlideTabsProps> = ({
  tabs,
  activeIndex,
  onChange,
  disabled = false
}) => {
  const [position, setPosition] = useState<Position>({
    left: 0,
    width: 0,
    height: 0,
    opacity: 0,
  });
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const moveToIndex = (idx: number, show = true) => {
    const el = tabRefs.current[idx];
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const scrollLeft = containerRef.current?.scrollLeft ?? 0;
    setPosition({
      left: el.offsetLeft - scrollLeft,
      width,
      height,
      opacity: show && !disabled ? 1 : (disabled ? 0.5 : 0)
    });
  };

  useEffect(() => {
    moveToIndex(activeIndex, true);
    const onResize = () => moveToIndex(activeIndex, true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [activeIndex, tabs.length, disabled]);

  return (
    <div
      ref={containerRef}
      onMouseLeave={() => moveToIndex(activeIndex, true)}
      className="relative inline-flex items-center rounded-full border border-[#846FFA]/25 bg-gradient-to-br from-white/25 to-white/10 backdrop-blur-md p-1 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.3)] dark:border-[#846FFA]/25 dark:from-[#846FFA]/12 dark:to-[#846FFA]/4 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
      role="tablist"
    >
      {tabs.map((label, idx) => (
        <button
          key={label}
          ref={(el) => { tabRefs.current[idx] = el; }}
          type="button"
          disabled={disabled}
          onMouseEnter={() => {
            if (disabled) return;
            const el = tabRefs.current[idx];
            if (!el) return;
            const { width, height } = el.getBoundingClientRect();
            const scrollLeft = containerRef.current?.scrollLeft ?? 0;
            setPosition({
              left: el.offsetLeft - scrollLeft,
              width,
              height,
              opacity: 1,
            });
          }}
          onClick={() => {
            if (disabled) return;
            onChange(idx);
            moveToIndex(idx, true);
          }}
          className={`relative z-10 cursor-pointer px-3 py-1.5 sm:px-6 sm:py-2 text-xs font-semibold uppercase tracking-[0.2em] transition-colors duration-200 whitespace-nowrap ${
            activeIndex === idx
              ? "text-[#2F285F] dark:text-[#F8F8FF]"
              : "text-[#5C5C5C] hover:text-[#2F285F] dark:text-[#C7C3E8]/80 dark:hover:text-[#F8F8FF]"
          } ${disabled ? "cursor-not-allowed opacity-50" : ""}`}
          aria-pressed={activeIndex === idx}
          role="tab"
        >
          {label}
        </button>
      ))}
      <motion.div
        animate={{
          left: position.left,
          width: position.width,
          height: position.height,
          opacity: position.opacity,
        }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
        className="absolute z-0 rounded-full bg-gradient-to-r from-[#856EFB]/50 to-[#856EFB]/70 shadow-[0_12px_28px_rgba(133,110,251,0.35)] pointer-events-none will-change-transform"
      />
    </div>
  );
};
