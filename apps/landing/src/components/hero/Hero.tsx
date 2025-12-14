"use client";

import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { gsap, ScrollTrigger } from "@/lib/anim/gsapClient";
import { StarParticles } from "./StarParticles";

export function Hero() {
  const heroRef = useRef<HTMLElement>(null);
  const titleLine1Ref = useRef<HTMLHeadingElement>(null);
  const titleLine2Ref = useRef<HTMLHeadingElement>(null);
  const ctaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Animate title line 1
      const words1 = titleLine1Ref.current?.querySelectorAll(".word");
      if (words1) {
        gsap.fromTo(
          words1,
          { opacity: 0, y: 40, filter: "blur(8px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 1,
            stagger: 0.08,
            ease: "power3.out",
            delay: 0.2,
          }
        );
      }

      // Animate title line 2
      const words2 = titleLine2Ref.current?.querySelectorAll(".word");
      if (words2) {
        gsap.fromTo(
          words2,
          { opacity: 0, y: 40, filter: "blur(8px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 1,
            stagger: 0.08,
            ease: "power3.out",
            delay: 0.5,
          }
        );
      }

      // Animate CTAs
      if (ctaRef.current) {
        gsap.fromTo(
          ctaRef.current,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.8,
            ease: "power3.out",
            delay: 0.9,
          }
        );
      }
    }, heroRef);

    return () => ctx.revert();
  }, []);

  return (
    <section
      ref={heroRef}
      className="relative min-h-screen flex items-center justify-center pt-20 md:pt-0 overflow-hidden"
    >
      {/* Background: ASCII Star Particles - now using CSS animations */}
      <div className="absolute inset-0 z-0">
        <StarParticles />
      </div>

      {/* Centered Text content */}
      <div className="container-narrow relative z-10 text-center">
        {/* Title Line 1 - Raleway for hero */}
        <h1
          ref={titleLine1Ref}
          className="text-[clamp(2rem,6vw,4.5rem)] leading-[1.1] tracking-[-0.02em] text-[#000000] mb-2"
          style={{ fontFamily: "'Raleway', sans-serif", fontWeight: 500 }}
        >
          {"Natural Language Interface".split(" ").map((word, i) => (
            <span key={i} className="word inline-block mr-[0.25em]">
              {word}
            </span>
          ))}
        </h1>

        {/* Title Line 2 - Plus Jakarta Sans italic style */}
        <h1
          ref={titleLine2Ref}
          className="font-serif font-medium text-[clamp(2rem,6vw,4.5rem)] leading-[1.1] tracking-[-0.01em] text-[#000000] mb-8 md:mb-12 italic"
        >
          {"for Crypto".split(" ").map((word, i) => (
            <span key={i} className="word inline-block mr-[0.25em]">
              {word}
            </span>
          ))}
        </h1>

        {/* CTA */}
        <div ref={ctaRef}>
          <Link
            href="https://app.pr4gma.xyz"
            target="_blank"
            rel="noopener noreferrer"
            className="group inline-flex items-center gap-2 bg-[#E07A5F] text-white text-base px-8 py-3.5 rounded-full transition-all duration-300 font-display tracking-wider"
          >
            <span className="transition-transform duration-300 group-hover:-translate-x-1">
              Launch App
            </span>
            <span className="inline-flex items-center overflow-hidden w-0 group-hover:w-5 transition-all duration-300">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="translate-x-[-20px] group-hover:translate-x-0 transition-transform duration-300"
              >
                <path d="M5 12h14" />
                <path d="m12 5 7 7-7 7" />
              </svg>
            </span>
          </Link>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 hidden md:block"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
          className="w-6 h-10 rounded-full border-2 border-[#E5E5E5] flex items-start justify-center p-2"
        >
          <motion.div className="w-1 h-2 rounded-full bg-[#666666]" />
        </motion.div>
      </motion.div>
    </section>
  );
}
