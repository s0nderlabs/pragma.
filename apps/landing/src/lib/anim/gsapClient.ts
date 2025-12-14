"use client";

import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP as useGSAPReact } from "@gsap/react";

let registered = false;

export const useGSAP = useGSAPReact;

export function ensureGsap() {
  if (typeof window === "undefined") return gsap;

  if (!registered) {
    gsap.registerPlugin(ScrollTrigger, useGSAPReact);
    registered = true;
  }
  return gsap;
}

export { gsap, ScrollTrigger };
