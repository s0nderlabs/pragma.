"use client";

import { useRef, useEffect, useState } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import Link from "next/link";
import { gsap, ScrollTrigger } from "@/lib/anim/gsapClient";

// Seeded random for consistent server/client rendering
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

// Pre-generate footer particles with deterministic values
const FOOTER_PARTICLES = Array.from({ length: 12 }, (_, i) => ({
  id: i,
  left: 10 + seededRandom(i * 100 + 1) * 80,
  top: 10 + seededRandom(i * 100 + 2) * 80,
  fontSize: 12 + seededRandom(i * 100 + 3) * 16,
  xOffset: seededRandom(i * 100 + 4) * 20 - 10,
  yOffset: seededRandom(i * 100 + 5) * 20 - 10,
  duration: 4 + seededRandom(i * 100 + 6) * 3,
  delay: seededRandom(i * 100 + 7) * 2,
}));

export function Footer() {
  const footerRef = useRef<HTMLElement>(null);
  const statementRef = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const { scrollYProgress } = useScroll({
    target: footerRef,
    offset: ["start end", "end end"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [0, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5], [50, 0]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Animate statement words
      const words = statementRef.current?.querySelectorAll(".statement-word");
      if (words) {
        gsap.fromTo(
          words,
          { opacity: 0, y: 40, filter: "blur(6px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.8,
            stagger: 0.06,
            ease: "power3.out",
            scrollTrigger: {
              trigger: footerRef.current,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          }
        );
      }
    }, footerRef);

    return () => ctx.revert();
  }, []);

  return (
    <footer
      ref={footerRef}
      className="relative min-h-screen flex flex-col justify-center overflow-hidden"
    >
      {/* Background particles - only render after mount to avoid hydration mismatch */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        {mounted &&
          FOOTER_PARTICLES.map((particle) => (
            <motion.span
              key={particle.id}
              initial={{ opacity: 0 }}
              animate={{
                opacity: [0.1, 0.3, 0.1],
                x: [0, particle.xOffset, 0],
                y: [0, particle.yOffset, 0],
              }}
              transition={{
                duration: particle.duration,
                delay: particle.delay,
                repeat: Infinity,
                ease: "easeInOut",
              }}
              className="absolute text-[#E07A5F] font-serif"
              style={{
                left: `${particle.left}%`,
                top: `${particle.top}%`,
                fontSize: particle.fontSize,
              }}
            >
              ✦
            </motion.span>
          ))}
      </div>

      <div className="container-wide relative z-10">
        {/* Statement */}
        <motion.div
          ref={statementRef}
          style={{ opacity, y }}
          className="text-left mb-12 md:mb-16 max-w-fit mx-auto"
        >
          <h2 className="text-[clamp(2.5rem,6vw,5rem)] leading-[1.1] tracking-[-0.02em] mb-8">
            {/* Making blockchain */}
            <span className="block text-[#000000]">
              <span className="statement-word inline-block mr-[0.25em] font-display font-extralight">
                Making
              </span>
              <span className="statement-word inline-block font-serif italic">
                blockchain
              </span>
            </span>
            {/* feel natural. */}
            <span className="block text-[#000000]">
              <span className="statement-word inline-block mr-[0.25em] font-display font-extralight">
                feel
              </span>
              <span className="statement-word inline-block font-serif italic">
                natural.
              </span>
            </span>
          </h2>

          {/* Bottom row */}
          <div className="flex items-center justify-between">
            {/* Copyright */}
            <p className="font-mono text-xs text-[#999999]">
              © s0nderlabs 2025. All rights reserved.
            </p>

            {/* X (Twitter) */}
            <Link
              href="https://x.com/s0nderlabs"
              target="_blank"
              rel="noopener noreferrer"
              className="text-[#999999] hover:text-[#000000] transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
              </svg>
            </Link>
          </div>

        </motion.div>
      </div>
    </footer>
  );
}
