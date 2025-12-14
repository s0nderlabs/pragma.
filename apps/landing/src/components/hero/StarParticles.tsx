"use client";

import { useEffect, useRef } from "react";

interface Particle {
  // Base position (0-1 normalized)
  baseX: number;
  baseY: number;
  // Depth (0 = far, 1 = close)
  z: number;
  // Random values for animation variation
  randomX: number;
  randomY: number;
  randomZ: number;
  randomW: number;
  // Visual properties
  char: string;
  baseSize: number;
  baseOpacity: number;
}

const PARTICLE_COUNT = 300;
const SPEED = 0.1;
const MOUSE_FACTOR = 1.2;
const TERRACOTTA = "#E07A5F";

// Size range based on depth
const SIZE_MIN = 6;
const SIZE_MAX = 24;

function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9999) * 10000;
  return x - Math.floor(x);
}

function generateParticles(): Particle[] {
  const result: Particle[] = [];
  // Add \uFE0E (text variation selector) to prevent emoji rendering on iOS
  const starChars = ["✦\uFE0E", "✧\uFE0E", "✶\uFE0E", "✴\uFE0E", "✵\uFE0E", "*"];

  for (let i = 0; i < PARTICLE_COUNT; i++) {
    // Z depth: 0 = far away, 1 = close
    const z = seededRandom(i * 100 + 11);

    const rand = seededRandom(i * 100 + 1);
    const isBrightStar = rand < 0.15;
    const isMediumStar = rand >= 0.15 && rand < 0.4;

    let char: string;
    let baseSize: number;
    let baseOpacity: number;

    if (isBrightStar) {
      char = starChars[Math.floor(seededRandom(i * 100 + 4) * 4)];
      baseSize = SIZE_MAX;
      baseOpacity = 0.6;
    } else if (isMediumStar) {
      char = starChars[Math.floor(seededRandom(i * 100 + 4) * 6)];
      baseSize = (SIZE_MIN + SIZE_MAX) / 2;
      baseOpacity = 0.4;
    } else {
      char = "·";
      baseSize = SIZE_MIN;
      baseOpacity = 0.3;
    }

    result.push({
      baseX: seededRandom(i * 100 + 2),
      baseY: seededRandom(i * 100 + 3),
      z,
      randomX: seededRandom(i * 100 + 7),
      randomY: seededRandom(i * 100 + 8),
      randomZ: seededRandom(i * 100 + 9),
      randomW: seededRandom(i * 100 + 10),
      char,
      baseSize,
      baseOpacity,
    });
  }

  // Sort by Z: far particles (low z) drawn first, close particles (high z) drawn last
  result.sort((a, b) => a.z - b.z);
  return result;
}

const PARTICLES = generateParticles();

export function StarParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const mouseRef = useRef({ x: 0, y: 0 });
  const targetMouseRef = useRef({ x: 0, y: 0 });
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let width = 0;
    let height = 0;

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const rect = canvas.getBoundingClientRect();
      width = rect.width;
      height = rect.height;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
    };

    resize();
    window.addEventListener("resize", resize);

    const handleMouseMove = (e: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      targetMouseRef.current = {
        x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
        y: -(((e.clientY - rect.top) / rect.height) * 2 - 1),
      };
    };

    const handleMouseLeave = () => {
      targetMouseRef.current = { x: 0, y: 0 };
    };

    canvas.addEventListener("mousemove", handleMouseMove);
    canvas.addEventListener("mouseleave", handleMouseLeave);

    const animate = (time: number) => {
      ctx.clearRect(0, 0, width, height);

      const t = time * 0.001 * SPEED;

      // Smooth mouse lerp
      mouseRef.current.x += (targetMouseRef.current.x - mouseRef.current.x) * 0.05;
      mouseRef.current.y += (targetMouseRef.current.y - mouseRef.current.y) * 0.05;

      ctx.fillStyle = TERRACOTTA;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";

      let currentFontSize = -1;

      for (let i = 0; i < PARTICLES.length; i++) {
        const p = PARTICLES[i];

        // Depth factor: 0.3 (far) to 1.0 (close)
        const depthScale = 0.3 + p.z * 0.7;

        // Size scales with depth (far = smaller, close = bigger)
        const size = Math.round(p.baseSize * depthScale);

        // Only change font when size changes
        if (size !== currentFontSize) {
          currentFontSize = size;
          ctx.font = `${size}px Georgia, serif`;
        }

        // Opacity scales with depth (far = more faded)
        const opacity = p.baseOpacity * depthScale;

        // Position
        let x = p.baseX * width;
        let y = p.baseY * height;

        // Floating movement - amplitude scales with depth (far = slower/smaller movement)
        const floatAmplitude = (10 + p.randomX * 20) * depthScale;
        x += Math.sin(t * p.randomZ * depthScale + Math.PI * 2 * p.randomW) * floatAmplitude;
        y += Math.sin(t * p.randomY * depthScale + Math.PI * 2 * p.randomX) * floatAmplitude;

        // Parallax - far particles move less, close particles move more
        const parallaxStrength = depthScale * MOUSE_FACTOR;
        x += -mouseRef.current.x * parallaxStrength * width * 0.08;
        y += -mouseRef.current.y * parallaxStrength * height * 0.08;

        // Draw
        ctx.globalAlpha = opacity;
        ctx.fillText(p.char, x, y);
      }

      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      window.removeEventListener("resize", resize);
      canvas.removeEventListener("mousemove", handleMouseMove);
      canvas.removeEventListener("mouseleave", handleMouseLeave);
      cancelAnimationFrame(animationRef.current);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 w-full h-full"
      style={{ pointerEvents: "auto" }}
    />
  );
}
