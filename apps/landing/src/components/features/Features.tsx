"use client";

import { useRef, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { gsap, ScrollTrigger } from "@/lib/anim/gsapClient";
import { ChatMockup, SwapMockup, StakeMockup, NFTMockup } from "./Mockups";

const FEATURES = [
  {
    id: "chat",
    headline: "Just say what you want",
    description:
      "Forget complex DEX interfaces and confusing buttons. Just type what you want to do in plain English, like texting a friend who happens to know everything about crypto.",
    Mockup: ChatMockup,
    align: "left" as const,
  },
  {
    id: "swap",
    headline: "Swap",
    description:
      "Tell Pragma what you want to trade and it handles the rest. Pragma finds the best routes, optimizes for gas, and executes with a single confirmation.",
    Mockup: SwapMockup,
    align: "right" as const,
  },
  {
    id: "stake",
    headline: "Stake",
    description:
      "Start earning yield in seconds. Just say how much you want to stake and Pragma takes care of the protocol details. No forms, no complexity.",
    Mockup: StakeMockup,
    align: "left" as const,
  },
  {
    id: "nft",
    headline: "Buy NFTs",
    description:
      "Explore collections, check floor prices, and purchase NFTs through conversation. Describe what you're looking for and Pragma will find it.",
    Mockup: NFTMockup,
    align: "right" as const,
  },
];

export function Features() {
  return (
    <section id="features" className="relative">
      {FEATURES.map((feature, index) => (
        <FeatureSection key={feature.id} feature={feature} index={index} />
      ))}
    </section>
  );
}

interface FeatureSectionProps {
  feature: (typeof FEATURES)[0];
  index: number;
}

function FeatureSection({ feature, index }: FeatureSectionProps) {
  const sectionRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const mockupRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  const y = useTransform(scrollYProgress, [0, 1], [60, -60]);
  const opacity = useTransform(scrollYProgress, [0, 0.3, 0.7, 1], [0, 1, 1, 0]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);

    const ctx = gsap.context(() => {
      // Animate text
      const headlineWords = textRef.current?.querySelectorAll(".headline-word");
      if (headlineWords) {
        gsap.fromTo(
          headlineWords,
          { opacity: 0, y: 30, filter: "blur(4px)" },
          {
            opacity: 1,
            y: 0,
            filter: "blur(0px)",
            duration: 0.8,
            stagger: 0.05,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 70%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }

      // Animate description
      const desc = textRef.current?.querySelector(".description");
      if (desc) {
        gsap.fromTo(
          desc,
          { opacity: 0, y: 20 },
          {
            opacity: 1,
            y: 0,
            duration: 0.6,
            delay: 0.3,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 70%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }

      // Animate mockup
      if (mockupRef.current) {
        gsap.fromTo(
          mockupRef.current,
          {
            opacity: 0,
            y: 40,
            scale: 0.95,
          },
          {
            opacity: 1,
            y: 0,
            scale: 1,
            duration: 0.8,
            delay: 0.2,
            ease: "power3.out",
            scrollTrigger: {
              trigger: sectionRef.current,
              start: "top 70%",
              toggleActions: "play none none reverse",
            },
          }
        );
      }
    }, sectionRef);

    return () => ctx.revert();
  }, []);

  const { Mockup, headline, description, align } = feature;

  return (
    <div
      ref={sectionRef}
      className="min-h-screen flex items-center py-16 md:py-24 px-6 md:px-12"
    >
      <div className="w-full max-w-[1600px] mx-auto">
        <div
          className={`grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-8 lg:gap-16 items-center ${
            align === "right" ? "lg:flex-row-reverse" : ""
          }`}
          style={{
            direction: align === "right" ? "rtl" : "ltr",
          }}
        >
          {/* Text */}
          <motion.div
            ref={textRef}
            style={{ y, direction: "ltr" }}
            className="relative z-10"
          >
            <h2 className="font-display font-extralight text-[clamp(2rem,5vw,3.5rem)] leading-[1.15] tracking-[-0.02em] text-[#000000] mb-4">
              {headline.split(" ").map((word, i) => (
                <span key={i} className="headline-word inline-block mr-[0.25em]">
                  {word}
                </span>
              ))}
            </h2>
            <p className="description text-base md:text-lg text-[#666666] max-w-md" style={{ fontFamily: "'Raleway', sans-serif" }}>
              {description}
            </p>
          </motion.div>

          {/* Mockup */}
          <motion.div
            ref={mockupRef}
            style={{ opacity, direction: "ltr" }}
            className="relative"
          >
            <div
              className="overflow-hidden"
              style={{ borderRadius: "var(--radius)" }}
            >
              <Mockup />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
