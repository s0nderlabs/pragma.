import { FILTER_MAP_DATA_URI } from "./filter-map";
import type { LiquidGlassFilterProps } from "./types";

/**
 * SVG Filter component for liquid glass effect
 * Uses displacement mapping with a noise texture to create distortion
 */
export function LiquidGlassFilter({
  filterId,
  stdDeviation = 0.04,
  scale = 0.5,
}: LiquidGlassFilterProps) {
  return (
    <div
      className="absolute inset-0 w-full h-full opacity-0 pointer-events-none -z-10"
      aria-hidden="true"
    >
      <svg
        width="100%"
        height="100%"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <filter
          id={filterId}
          primitiveUnits="objectBoundingBox"
          x="-200%"
          y="-200%"
          width="500%"
          height="500%"
        >

          <feGaussianBlur
            in="SourceGraphic"
            stdDeviation={stdDeviation}
            result="blur"
          />
          <feDisplacementMap
            in="blur"
            in2="map"
            scale={scale}
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </svg>
    </div>
  );
}
