'use client'

export default function Background() {
  // Use Tailwind's bg-background utility for consistent theming
  // This automatically switches between light and dark modes
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 z-0 w-full h-full bg-background"
    />
  )
}
