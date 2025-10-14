import type { Metadata } from "next";
import { Geist_Mono, Space_Grotesk } from "next/font/google";

import { ThemeProvider } from "../components/theme-provider";
import { cn } from "../lib/utils";

import "./globals.css";

const spaceGrotesk = Space_Grotesk({
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
          spaceGrotesk.variable,
          geistMono.variable,
        )}
      >
        <ThemeProvider>
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
