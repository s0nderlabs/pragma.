"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { usePrefersReducedMotion } from "./usePrefersReducedMotion";

/**
 * Hook to add mouse-tracking 3D tilt effect to cards
 * Returns a ref to attach to the card element
 */
export function useCardTilt<T extends HTMLElement = HTMLDivElement>() {
  const cardRef = useRef<T>(null);
  const prefersReducedMotion = usePrefersReducedMotion();

  useEffect(() => {
    const card = cardRef.current;
    if (!card || prefersReducedMotion) return;

    const handleMouseMove = (e: MouseEvent) => {
      const { left, top, width, height } = card.getBoundingClientRect();
      const x = (e.clientX - left) / width - 0.5; // -0.5 to 0.5
      const y = (e.clientY - top) / height - 0.5;

      gsap.to(card, {
        rotateY: x * 6, // -3deg to +3deg
        rotateX: -y * 6, // inverted for natural feel
        duration: 0.3,
        ease: "power2.out",
        transformPerspective: 1000,
      });
    };

    const handleMouseLeave = () => {
      gsap.to(card, {
        rotateY: 0,
        rotateX: 0,
        duration: 0.5,
        ease: "power2.out",
      });
    };

    card.addEventListener("mousemove", handleMouseMove);
    card.addEventListener("mouseleave", handleMouseLeave);

    return () => {
      card.removeEventListener("mousemove", handleMouseMove);
      card.removeEventListener("mouseleave", handleMouseLeave);
    };
  }, [prefersReducedMotion]);

  return cardRef;
}
