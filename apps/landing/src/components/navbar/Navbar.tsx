"use client";

import { useState, useRef } from "react";
import { motion, useScroll, useMotionValueEvent } from "framer-motion";
import Link from "next/link";
import Image from "next/image";

const NAV_LINKS = [
  { href: "#features", label: "Features" },
  { href: "https://docs.pr4gma.xyz", label: "Docs", external: true },
];

export function Navbar() {
  const [isVisible, setIsVisible] = useState(true);
  const lastScrollY = useRef(0);
  const { scrollY } = useScroll();

  useMotionValueEvent(scrollY, "change", (latest) => {
    // Show/hide based on scroll direction
    if (latest > lastScrollY.current && latest > 100) {
      setIsVisible(false);
    } else {
      setIsVisible(true);
    }
    lastScrollY.current = latest;
  });

  return (
    <motion.nav
      initial={{ y: 0, opacity: 1 }}
      animate={{ y: isVisible ? 0 : -40, opacity: isVisible ? 1 : 0 }}
      transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="fixed top-0 left-0 right-0 z-50 px-6 md:px-8 py-6 flex items-center justify-between"
    >
      {/* Logo - Left Edge */}
      <Link href="/" className="flex items-center">
        <Image
          src="/pragma-logo.svg"
          alt="Pragma"
          width={100}
          height={39}
          className="h-12 md:h-14 w-auto"
          priority
        />
      </Link>

      {/* Navigation - Right Edge */}
      <div className="flex items-center gap-6 md:gap-8">
        {NAV_LINKS.map((link) => (
          <Link
            key={link.label}
            href={link.href}
            target={link.external ? "_blank" : undefined}
            rel={link.external ? "noopener noreferrer" : undefined}
            className="text-sm text-[#000000] hover:text-[#666666] transition-colors duration-200"
            style={{ fontFamily: "'Raleway', sans-serif" }}
          >
            {link.label}
          </Link>
        ))}
      </div>
    </motion.nav>
  );
}
