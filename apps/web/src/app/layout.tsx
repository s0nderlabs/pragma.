import type { Metadata } from "next";
import { Geist_Mono, IBM_Plex_Mono } from "next/font/google";

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
  title: "Pragma Console",
  description: "HybridDelegator onboarding and delegated execution for Monad",
  viewport: {
    width: "device-width",
    initialScale: 1,
    maximumScale: 5,
  },
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
      </body>
    </html>
  );
}
