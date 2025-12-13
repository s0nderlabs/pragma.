"use client";

import { useRef, useEffect } from "react";
import { motion, useScroll, useTransform } from "framer-motion";
import { gsap, ScrollTrigger } from "@/lib/anim/gsapClient";

export function AppShowcase() {
  const sectionRef = useRef<HTMLElement>(null);
  const videoContainerRef = useRef<HTMLDivElement>(null);

  const { scrollYProgress } = useScroll({
    target: sectionRef,
    offset: ["start end", "end start"],
  });

  // Parallax transforms
  const rotateX = useTransform(scrollYProgress, [0, 0.5], [15, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [0.9, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5], [100, 0]);
  const opacity = useTransform(scrollYProgress, [0, 0.3], [0, 1]);
  const shadowBlur = useTransform(scrollYProgress, [0, 0.5], [60, 40]);

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
  }, []);

  return (
    <section
      ref={sectionRef}
      className="relative py-[var(--spacing-section-mobile)] md:py-[var(--spacing-section)] overflow-hidden"
    >
      <div className="container-wide">
        {/* Video Container with 3D perspective */}
        <div className="relative" style={{ perspective: "1200px" }}>
          <motion.div
            ref={videoContainerRef}
            style={{
              rotateX,
              scale,
              y,
              opacity,
            }}
            className="relative mx-auto max-w-[1000px]"
          >
            {/* Shadow */}
            <motion.div
              style={{
                filter: useTransform(
                  shadowBlur,
                  (v) => `blur(${v}px)`
                ),
              }}
              className="absolute -bottom-8 left-[10%] right-[10%] h-16 bg-black/10 rounded-[100%]"
            />

            {/* Video Frame */}
            <div
              className="relative overflow-hidden"
              style={{ borderRadius: "var(--radius)" }}
            >
              <div className="aspect-[16/10] relative">
                {/* Demo Video */}
                <video
                  autoPlay
                  muted
                  loop
                  playsInline
                  className="w-full h-full object-cover"
                >
                  <source src="/pragma-main-flow.mp4" type="video/mp4" />
                </video>
              </div>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
