import type { Metadata, Viewport } from "next";
import { Geist_Mono, IBM_Plex_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";

import { ThemeProvider } from "../components/theme-provider";
import { ThemeSynchronizer } from "../components/ThemeSynchronizer";
import { cn } from "../lib/utils";

import "./globals.css";

const ibmPlexMono = IBM_Plex_Mono({
  weight: ["400", "500", "600", "700"],
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Pragma",
  description: "Natural language interface for crypto",
  icons: {
    icon: "/pragma-logo.svg",
  },
};

// Viewport configuration with safe area support for iOS notch/dynamic island
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
  viewportFit: "cover", // Enable safe area insets for iOS
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          ibmPlexMono.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          <ThemeSynchronizer />
          {children}
        </ThemeProvider>
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}
