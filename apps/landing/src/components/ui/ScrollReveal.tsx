"use client";

import React, { useEffect, useRef, useMemo, type ReactNode } from "react";
import { gsap, ScrollTrigger } from "@/lib/anim/gsapClient";

interface ScrollRevealProps {
  children: ReactNode;
  enableBlur?: boolean;
  blurStrength?: number;
  className?: string;
  textClassName?: string;
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  delay?: number;
  stagger?: number;
  start?: string;
  end?: string;
}

export function ScrollReveal({
  children,
  enableBlur = true,
  blurStrength = 4,
  className = "",
  textClassName = "",
  as: Component = "div",
  delay = 0,
  stagger = 0.04,
  start = "top 85%",
  end = "top 35%",
}: ScrollRevealProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  const splitText = useMemo(() => {
    const text = typeof children === "string" ? children : "";
    return text.split(/(\s+)/).map((word, index) =>
      /^\s+$/.test(word) ? (
        <span key={index}>{word}</span>
      ) : (
        <span className="inline-block word" key={index}>
          {word}
        </span>
      )
    );
  }, [children]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    // Register plugin
    gsap.registerPlugin(ScrollTrigger);

    const words = el.querySelectorAll<HTMLElement>(".word");

    // Set initial state
    gsap.set(words, {
      opacity: 0,
      y: 20,
      filter: enableBlur ? `blur(${blurStrength}px)` : "none",
    });

    // Animate on scroll
    const tl = gsap.to(words, {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      duration: 0.8,
      stagger: stagger,
      delay: delay,
      ease: "power3.out",
      scrollTrigger: {
        trigger: el,
        start: start,
        end: end,
        toggleActions: "play none none reverse",
      },
    });

    return () => {
      tl.scrollTrigger?.kill();
      tl.kill();
    };
  }, [enableBlur, blurStrength, delay, stagger, start, end]);

  return (
    <Component ref={containerRef as any} className={className}>
      <span className={textClassName}>{splitText}</span>
    </Component>
  );
}
