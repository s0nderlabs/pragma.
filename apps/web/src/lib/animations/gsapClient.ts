"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP as useGSAPReact } from "@gsap/react";

let registered = false;

export const useGSAP = useGSAPReact;

export function ensureGsap() {
  if (!registered) {
    gsap.registerPlugin(ScrollTrigger, useGSAPReact);

    // Set default easing and duration for consistency
    gsap.defaults({
      ease: "power2.out",
      duration: 0.3,
    });

    registered = true;
  }
  return gsap;
}

export { ScrollTrigger };
export default gsap;
