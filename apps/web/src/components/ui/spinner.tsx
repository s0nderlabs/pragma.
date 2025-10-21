"use client";

import { useRef, useEffect } from "react";
import gsap from "gsap";
import { cn } from "../../lib/utils";

const Spinner = ({ className }: { className?: string }) => {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const dots = containerRef.current.querySelectorAll('.spinner-dot');

    // Create infinite stagger animation
    const timeline = gsap.timeline({ repeat: -1 });

    // Animate scale and opacity with keyframes
    timeline.to(dots, {
      keyframes: [
        { scale: 1.4, opacity: 1, duration: 0.3 },
        { scale: 1, opacity: 0.3, duration: 0.3 }
      ],
      stagger: 0.15,
      ease: "power2.inOut",
    });

    return () => {
      timeline.kill();
    };
  }, []);

  return (
    <div ref={containerRef} className={cn("flex items-center gap-1", className)}>
      {[0, 1, 2].map((index) => (
        <div
          key={index}
          className="spinner-dot h-1.5 w-1.5 rounded-full bg-current opacity-30"
        />
      ))}
    </div>
  );
};

export { Spinner };
